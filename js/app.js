// storage.js
// Banco interno em localStorage para uso em site estático.
// Login padrão do painel: admin / 123456.
// Observação: por ser armazenamento do navegador, os dados ficam salvos no computador/navegador usado.

const COLLECTION_SOLICITACOES = "solicitacoes_passagens_diarias";
const COLLECTION_ALTERACOES = "alteracoes_solicitacoes";
const STORAGE_KEYS = {
  requests: "formulario_demanda_solicitacoes",
  auditLogs: "formulario_demanda_alteracoes",
  admins: "formulario_demanda_admins",
  session: "formulario_demanda_admin_session",
};
const DEFAULT_ADMIN = {
  login: "admin",
  password: "123456",
  createdAt: "padrão",
};

const app = { mode: "internal-local-storage" };
const auth = { mode: "internal-local-storage" };
const db = {
  mode: "internal-local-storage",
  api: false,
  cloud: initializeCloudDatabase(),
};
if (db.cloud) db.mode = "cloud-firestore";
const API_BASE = "/api";
const REQUESTS_PAGE_SIZE = 8;

function storageAvailable() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function firebaseConfigReady(config) {
  if (!config.enabled) return false;
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
    const value = String(config[key] || "");
    return value && !value.startsWith("COLE_") && !value.startsWith("SEU_");
  });
}

function initializeCloudDatabase() {
  const config = window.FIREBASE_CONFIG;
  if (!firebaseConfigReady(config)) return null;
  if (!window.firebase.initializeApp || !window.firebase.firestore) {
    console.warn("Firebase não carregado. Usando armazenamento local.");
    return null;
  }

  try {
    const firebaseApp = window.firebase.apps?.length
      ? window.firebase.app()
      : window.firebase.initializeApp(config);
    return firebaseApp.firestore();
  } catch (error) {
    console.error("Erro ao conectar no Firestore:", error);
    return null;
  }
}

function usingCloudDatabase() {
  return Boolean(db.cloud);
}

function usingApiDatabase() {
  return Boolean(db.api) && !usingCloudDatabase();
}

async function apiRequest(path, options = {}) {
  const session = savedSession();
  const authHeader = session.token
    ? { Authorization: `Bearer ${session.token}` }
    : {};
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || "Erro ao acessar o backend.");
  return payload;
}

function readJSON(key, fallback) {
  if (!storageAvailable()) return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    console.error("Erro ao ler banco interno:", error);
    return fallback;
  }
}

function writeJSON(key, value) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function savedSession() {
  return readJSON(STORAGE_KEYS.session, null) || {};
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getAdminUsers() {
  const users = readJSON(STORAGE_KEYS.admins, []);
  const hasDefault = users.some(
    (user) => normalizeLogin(user.login) === DEFAULT_ADMIN.login,
  );
  if (!hasDefault) {
    users.unshift(DEFAULT_ADMIN);
    writeJSON(STORAGE_KEYS.admins, users);
  }
  return users;
}

function createAdminUser(login, password) {
  const cleanLogin = normalizeLogin(login);
  const cleanPassword = String(password || "").trim();
  if (!cleanLogin) throw new Error("Informe um login para cadastro.");
  if (cleanPassword.length < 4)
    throw new Error("A senha precisa ter pelo menos 4 caracteres.");

  const users = getAdminUsers();
  if (users.some((user) => normalizeLogin(user.login) === cleanLogin)) {
    throw new Error("Este login já está cadastrado.");
  }

  const user = {
    login: cleanLogin,
    password: cleanPassword,
    createdAt: new Date().toLocaleString("pt-BR"),
  };
  users.push(user);
  writeJSON(STORAGE_KEYS.admins, users);
  return { login: user.login, createdAt: user.createdAt };
}

function currentUser() {
  const session = savedSession();
  if (!session.login) return null;
  return { login: session.login };
}

async function signInWithEmailAndPassword(_auth, login, password) {
  if (usingApiDatabase()) {
    const payload = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    writeJSON(STORAGE_KEYS.session, {
      login: payload.user.login,
      token: payload.token,
      expiresAt: payload.expiresAt,
      loggedAt: new Date().toISOString(),
    });
    return { user: payload.user };
  }

  const users = getAdminUsers();
  const cleanLogin = normalizeLogin(login);
  const user = users.find(
    (item) =>
      normalizeLogin(item.login) === cleanLogin &&
      String(item.password) === String(password),
  );
  if (!user) throw new Error("Login ou senha inválidos.");
  writeJSON(STORAGE_KEYS.session, {
    login: user.login,
    loggedAt: new Date().toISOString(),
  });
  return { user: { login: user.login } };
}

function onAuthStateChanged(_auth, callback) {
  setTimeout(() => callback(currentUser()), 0);
  return () => {};
}

async function signOut() {
  if (usingApiDatabase()) {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
  }
  if (storageAvailable()) window.localStorage.removeItem(STORAGE_KEYS.session);
}

function serverTimestamp() {
  return new Date().toISOString();
}

function collection(_db, collectionName) {
  return { collectionName };
}

function doc(_db, collectionName, id) {
  return { collectionName, id };
}

function orderBy(field, direction = "asc") {
  return { field, direction };
}

function query(collectionRef, order) {
  return { collectionName: collectionRef.collectionName, order };
}

function getRequests() {
  return readJSON(STORAGE_KEYS.requests, []);
}

function saveRequests(requests) {
  writeJSON(STORAGE_KEYS.requests, requests);
}

function storageKeyByCollection(collectionName) {
  if (collectionName === COLLECTION_ALTERACOES) return STORAGE_KEYS.auditLogs;
  return STORAGE_KEYS.requests;
}

function apiPathByCollection(collectionName) {
  if (collectionName === COLLECTION_ALTERACOES) return "/alteracoes";
  return "/solicitacoes";
}

function getLocalCollectionRows(collectionName) {
  return readJSON(storageKeyByCollection(collectionName), []);
}

function saveLocalCollectionRows(collectionName, rows) {
  writeJSON(storageKeyByCollection(collectionName), rows);
}

async function setDoc(documentRef, data) {
  if (usingCloudDatabase()) {
    await db.cloud
      .collection(documentRef.collectionName)
      .doc(documentRef.id)
      .set({ ...data, id: documentRef.id }, { merge: true });
    return;
  }
  if (usingApiDatabase()) {
    await apiRequest(
      `${apiPathByCollection(documentRef.collectionName)}/${encodeURIComponent(documentRef.id)}`,
      {
        method: "PUT",
        body: JSON.stringify({ ...data, id: documentRef.id }),
      },
    );
    return;
  }

  const rows = getLocalCollectionRows(documentRef.collectionName);
  const index = rows.findIndex((item) => item.id === documentRef.id);
  const savedData = { ...data, id: documentRef.id };
  if (index >= 0) rows[index] = savedData;
  else rows.push(savedData);
  saveLocalCollectionRows(documentRef.collectionName, rows);
}

async function addDoc(collectionRef, data) {
  const id = data.id || createRequestId();
  await setDoc(
    { collectionName: collectionRef.collectionName, id },
    { ...data, id },
  );
  return { id };
}

async function getDocs(queryRef) {
  if (usingCloudDatabase()) {
    let collectionQuery = db.cloud.collection(queryRef.collectionName);
    if (queryRef.order.field) {
      collectionQuery = collectionQuery.orderBy(
        queryRef.order.field,
        queryRef.order.direction || "asc",
      );
    }
    const snapshot = await collectionQuery.get();
    return {
      docs: snapshot.docs.map((document) => ({
        id: document.id,
        data: () => ({ id: document.id, ...document.data() }),
      })),
    };
  }
  if (usingApiDatabase()) {
    const params = new URLSearchParams();
    if (queryRef.order.field) params.set("sort", queryRef.order.field);
    if (queryRef.order.direction) params.set("order", queryRef.order.direction);
    const queryString = params.toString();
    const payload = await apiRequest(
      `${apiPathByCollection(queryRef.collectionName)}${queryString ? `?${queryString}` : ""}`,
    );
    return {
      docs: (payload.data || []).map((row) => ({
        id: row.id,
        data: () => ({ ...row }),
      })),
    };
  }

  const rows = getLocalCollectionRows(queryRef.collectionName).sort((a, b) => {
    const direction = queryRef?.order?.direction === "desc" ? -1 : 1;
    const field = queryRef?.order?.field || "createdAt";
    return (
      String(a[field] || "").localeCompare(String(b[field] || "")) * direction
    );
  });

  return {
    docs: rows.map((row) => ({
      id: row.id,
      data: () => ({ ...row }),
    })),
  };
}

async function deleteDoc(documentRef) {
  if (usingCloudDatabase()) {
    await db.cloud
      .collection(documentRef.collectionName)
      .doc(documentRef.id)
      .delete();
    return;
  }
  if (usingApiDatabase()) {
    await apiRequest(
      `${apiPathByCollection(documentRef.collectionName)}/${encodeURIComponent(documentRef.id)}`,
      { method: "DELETE" },
    );
    return;
  }

  saveRequests(getRequests().filter((item) => item.id !== documentRef.id));
}

async function findRequestById(id) {
  const cleanId = normalizeText(id).toUpperCase();
  if (!cleanId) throw new Error("Informe o ID da solicitação.");

  if (usingCloudDatabase()) {
    const snapshot = await db.cloud
      .collection(COLLECTION_SOLICITACOES)
      .doc(cleanId)
      .get();
    if (!snapshot.exists) return null;
    return { id: snapshot.id, ...snapshot.data() };
  }
  if (usingApiDatabase()) {
    try {
      const payload = await apiRequest(
        `/solicitacoes/${encodeURIComponent(cleanId)}`,
      );
      return payload.data || null;
    } catch (error) {
      if (
        String(error.message || "")
          .toLowerCase()
          .includes("encontrada")
      )
        return null;
      throw error;
    }
  }

  return (
    getRequests().find(
      (item) => normalizeText(item.id).toUpperCase() === cleanId,
    ) || null
  );
}

const linkedProjects = [
  {
    idFiotec: "GEREB-005-FEX-20",
    projetoId: "2.362",
    coordenador: "Wagner De Jesus Martins",
    setorFiocruz: "Inovação E Complexo Produtivo Em Saúde",
  },
  {
    idFiotec: "GEREB-007-FIO-20",
    projetoId: "2.388",
    coordenador: "Noely Fabiana Oliveira De Moura",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-008-FIO-20",
    projetoId: "2.398",
    coordenador: "José Antonio Silvestre Fernandes Neto",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-022-FIO-20",
    projetoId: "2.489",
    coordenador: "Luciana Sepúlveda Koptcke",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-013-FIO-21",
    projetoId: "2.721",
    coordenador: "Daniella Cristina Rodrigues Pereira",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-009-FEX-22",
    projetoId: "2.869",
    coordenador: "André Vinícius Pires Guerrero",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-010-FEX-22",
    projetoId: "2.867",
    coordenador: "Kellen Cristina Da Silva Gasque",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-014-FIO-22",
    projetoId: "2.905",
    coordenador: "Wagner De Jesus Martins",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-021-FIO-22",
    projetoId: "2.934",
    coordenador: "Noely Fabiana Oliveira De Moura",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-024-FIO-22",
    projetoId: "2.938",
    coordenador: "Kellen Cristina Da Silva Gasque",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-001-FIO-23",
    projetoId: "3.050",
    coordenador: "Kellen Cristina Da Silva Gasque",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-002-FIO-23",
    projetoId: "3.055",
    coordenador: "Maria Do Carmo Leal",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-007-FEX-23",
    projetoId: "3.126",
    coordenador: "Ana Conceição Ribeiro Dantas Saturnino",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-015-FIO-23",
    projetoId: "3.216",
    coordenador: "Andre Luiz Dutra Fenner",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-019-FIO-23",
    projetoId: "3.243",
    coordenador: "Wagner De Jesus Martins",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-018-FIO-23",
    projetoId: "3.252",
    coordenador: "José Antonio Silvestre Fernandes Neto",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-020-FIO-23",
    projetoId: "3.258",
    coordenador: "Denise Oliveira E Silva",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-023-FIO-23",
    projetoId: "3.305",
    coordenador: "Márcio Aldrin França Cavalcante",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-021-FIO-23",
    projetoId: "3.306",
    coordenador: "Noely Fabiana Oliveira De Moura",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-022-FIO-23",
    projetoId: "3.307",
    coordenador: "Denise Oliveira E Silva",
    setorFiocruz: "Saúde E Sustentabilidade Socioambiental",
  },
  {
    idFiotec: "GEREB-024-FIO-23",
    projetoId: "3.309",
    coordenador: "Denise Oliveira E Silva",
    setorFiocruz: "Saúde E Sustentabilidade Socioambiental",
  },
  {
    idFiotec: "GEREB-025-FIO-23",
    projetoId: "3.310",
    coordenador: "André Vinicius Pires Guerrero",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-029-FIO-23",
    projetoId: "3.328",
    coordenador: "Wagner Jesus Martins",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
  {
    idFiotec: "GEREB-030-FIO-23",
    projetoId: "3.342",
    coordenador: "Osvaldo Peralta Bonetti",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-031-FIO-23",
    projetoId: "3.347",
    coordenador: "Osvaldo Peralta Bonetti",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-032-FIO-23",
    projetoId: "3.348",
    coordenador: "Wagner Jesus Martins",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-033-FIO-23",
    projetoId: "3.349",
    coordenador: "Márcio Aldrin França Cavalcante",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-036-FIO-23",
    projetoId: "3.352",
    coordenador: "José Antônio Silvestre Fernandes Neto",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-035-FIO-23",
    projetoId: "3.353",
    coordenador: "Kellen Cristina Da Silva Gasque",
    setorFiocruz:
      "Atenção, Promoção, Vigilâncias, Geração De Conhecimentos E Formação Para O SUS",
  },
  {
    idFiotec: "GEREB-037-FIO-23",
    projetoId: "3.354",
    coordenador: "Wagner Jesus Martins",
    setorFiocruz: "Ciência, Tecnologia, Saúde E Sociedade",
  },
];

const brazilianBanks = Array.isArray(window.BRAZILIAN_BANKS)
  ? window.BRAZILIAN_BANKS
  : [];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeProjectId(value) {
  return normalizeText(value).toUpperCase();
}

function findLinkedProject(value) {
  const normalized = normalizeProjectId(value);
  return linkedProjects.find(
    (project) => normalizeProjectId(project.idFiotec) === normalized,
  );
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  if (dateValue.toDate) return dateValue.toDate().toLocaleString("pt-BR");
  const parts = String(dateValue).split("-");
  if (parts.length !== 3) return String(dateValue);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHTML(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createRequestId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SOL-${date}-${randomPart}`;
}

function createAuditId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `ALT-${date}-${randomPart}`;
}

function isValidCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  function digit(length) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  }

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const requestFields = [
  "id",
  "createdAt",
  "status",
  "descricaoSolicitacao",
  "nomeEvento",
  "dataEvento",
  "localEvento",
  "justificativa",
  "idFiotec",
  "metaProjeto",
  "coordenador",
  "setorFiocruz",
  "nomeCompleto",
  "dataNascimento",
  "cargoFuncao",
  "cpf",
  "banco",
  "agencia",
  "contaCorrente",
  "necessidade",
  "localOrigem",
  "dataIda",
  "horarioIda",
  "vooIda",
  "localDestino",
  "dataVolta",
  "horarioVolta",
  "necessarioValorMaximoDiaria",
  "valorMaximoDiaria",
];

const csvHeaders = [
  "ID",
  "Data de Envio",
  "Status",
  "Descrição da Solicitação",
  "Nome do Evento",
  "Data do Evento",
  "Local do Evento",
  "Justificativa",
  "ID FIOTEC",
  "Meta do Projeto",
  "Coordenador",
  "Setor Fiocruz",
  "Nome Completo",
  "Data de Nascimento",
  "Cargo/Função",
  "CPF",
  "Banco",
  "Agência",
  "Conta Corrente",
  "Necessidade",
  "Local de Origem",
  "Data de Ida",
  "Horário de Ida",
  "Voo de Ida",
  "Local de Destino",
  "Data de Volta",
  "Horário de Volta",
  "Necessário Valor Máximo Diária",
  "Valor Máximo Diária",
];

const auditColumns = [
  { key: "titulo", label: "Titulo" },
  { key: "idAlteracao", label: "ID_ALTERACAO" },
  { key: "idChamado", label: "ID_CHAMADO" },
  { key: "tipoAlteracao", label: "TIPO_ALTERACAO" },
  { key: "motivoAlteracao", label: "MOTIVO_ALTERA..." },
  { key: "dataAlteracaoClient", label: "DATA_ALTERACAO" },
  { key: "campoAlterado", label: "CAMPO_ALTERADO" },
  { key: "alteradoPor", label: "ALTERADO_POR" },
  { key: "valorOriginal", label: "VALOR_ORIGINAL" },
  { key: "valorNovo", label: "VALOR_OVO" },
  { key: "origem", label: "ORIGEM" },
  { key: "observacao", label: "OBSERVACAO" },
];

const state = {
  allResponses: [],
  filteredResponses: [],
  auditLogs: [],
  editingRequest: null,
  activeAdminTab: "dashboard",
  requestStatusFilter: "all",
  requestDateFilter: "all",
  requestsPage: 1,
};

const pages = {
  home: document.getElementById("homePage"),
  form: document.getElementById("formPage"),
  login: document.getElementById("loginPage"),
  admin: document.getElementById("adminPage"),
};

function showPage(pageName) {
  Object.values(pages).forEach((page) => page.classList.add("hidden"));
  pages[pageName].classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageName === "admin") loadRequests();
}

function showMessage(targetId, text, type = "success") {
  document.getElementById(targetId).innerHTML =
    `<div class="message ${type === "error" ? "error" : ""}">${text}</div>`;
}

function switchAdminTab(tabName) {
  state.activeAdminTab = tabName;
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminTab === tabName);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.adminPanel === tabName);
  });
}

function updateStorageStatus() {
  const modeLabel = document.getElementById("storageModeLabel");
  const subtitle = document.getElementById("storageSubtitle");
  const cloudText = "Firestore conectado";
  const apiText = "Backend conectado";
  const localText = "Banco local";

  if (modeLabel)
    modeLabel.textContent = usingCloudDatabase()
      ? cloudText
      : usingApiDatabase()
        ? apiText
        : localText;
  if (subtitle) {
    subtitle.textContent = usingCloudDatabase()
      ? "Dados sincronizados no Firestore e disponíveis em qualquer computador."
      : usingApiDatabase()
        ? "Dados sincronizados pelo backend local e disponíveis para todos que acessarem este servidor."
        : "Dados carregados do banco interno deste navegador. Configure o Firebase ou use o backend local para sincronizar entre computadores.";
  }
}

function populateProjectDatalist() {
  document.getElementById("projectOptions").innerHTML = linkedProjects
    .map(
      (project) =>
        `<option value="${project.idFiotec}">${project.projetoId} - ${project.coordenador}</option>`,
    )
    .join("");
}

function populateBankDatalist() {
  const target = document.getElementById("bankOptions");
  if (!target) return;
  target.innerHTML = brazilianBanks
    .map((bank) => {
      const code = String(bank.code || "").padStart(3, "0");
      const name = normalizeText(bank.name);
      const value = `${code} - ${name}`;
      return `<option value="${escapeHTML(value)}">${escapeHTML(name)}</option>`;
    })
    .join("");
}

function applyLinkedProject() {
  const form = document.getElementById("requestForm");
  const feedback = document.getElementById("projectFeedback");
  const project = findLinkedProject(form.elements.idFiotec.value);

  if (!project) {
    form.elements.metaProjeto.value = "";
    form.elements.coordenador.value = "";
    form.elements.setorFiocruz.value = "";
    feedback.textContent =
      "Projeto não localizado na base. Confira o ID FIOTEC informado.";
    feedback.style.color = "#9f1f16";
    return null;
  }

  form.elements.idFiotec.value = project.idFiotec;
  form.elements.metaProjeto.value = project.projetoId;
  form.elements.coordenador.value = project.coordenador;
  form.elements.setorFiocruz.value = project.setorFiocruz;
  feedback.textContent =
    "Projeto encontrado: campos 7, 8 e 9 preenchidos automaticamente.";
  feedback.style.color = "#04724d";
  return project;
}

function validateData(data) {
  if (!isValidCPF(data.cpf))
    throw new Error("CPF inválido. Confira os 11 dígitos informados.");
  if (data.dataIda && data.dataVolta && data.dataIda > data.dataVolta) {
    throw new Error("A data de volta não pode ser anterior à data de ida.");
  }
  if (!findLinkedProject(data.idFiotec))
    throw new Error("ID FIOTEC não encontrado na base de projetos vinculados.");
  if (
    requiresDailyLimit(data.necessarioValorMaximoDiaria) &&
    parseMoneyValue(data.valorMaximoDiaria) <= 0
  ) {
    throw new Error("Informe o valor máximo para diária em reais.");
  }
}

function buildRequestObject(form, existingRequest = null) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  Object.keys(data).forEach((key) => {
    data[key] = normalizeText(data[key]);
  });
  validateData(data);
  const project = findLinkedProject(data.idFiotec);
  const dailyLimitValue = requiresDailyLimit(data.necessarioValorMaximoDiaria)
    ? formatMoneyInputValue(data.valorMaximoDiaria)
    : "";

  return {
    ...existingRequest,
    id: existingRequest?.id || createRequestId(),
    createdAt: existingRequest?.createdAt || serverTimestamp(),
    createdAtClient:
      existingRequest?.createdAtClient || new Date().toLocaleString("pt-BR"),
    createdAtIso: existingRequest?.createdAtIso || new Date().toISOString(),
    updatedAt: existingRequest ? serverTimestamp() : "",
    updatedAtClient: existingRequest ? new Date().toLocaleString("pt-BR") : "",
    status: existingRequest?.status || "Recebida",
    descricaoSolicitacao: data.descricaoSolicitacao,
    nomeEvento: data.nomeEvento,
    dataEvento: data.dataEvento,
    localEvento: data.localEvento,
    justificativa: data.justificativa,
    idFiotec: project.idFiotec,
    metaProjeto: project.projetoId,
    coordenador: project.coordenador,
    setorFiocruz: project.setorFiocruz,
    nomeCompleto: data.nomeCompleto,
    dataNascimento: data.dataNascimento,
    cargoFuncao: data.cargoFuncao,
    cpf: onlyDigits(data.cpf),
    banco: data.banco,
    agencia: data.agencia,
    contaCorrente: data.contaCorrente,
    necessidade: data.necessidade,
    localOrigem: data.localOrigem,
    dataIda: data.dataIda,
    horarioIda: data.horarioIda,
    vooIda: data.vooIda,
    localDestino: data.localDestino,
    dataVolta: data.dataVolta,
    horarioVolta: data.horarioVolta,
    necessarioValorMaximoDiaria: data.necessarioValorMaximoDiaria,
    valorMaximoDiaria: dailyLimitValue,
    projetoVinculado: { ...project },
  };
}

function generatePDF(data) {
  if (!window.jspdf.jsPDF)
    return alert(
      "Biblioteca de PDF não carregada. Verifique sua conexão com a internet.",
    );
  const docPDF = new window.jspdf.jsPDF();
  let y = 16;
  const addText = (label, value) => {
    if (y > 280) {
      docPDF.addPage();
      y = 16;
    }
    const lines = docPDF.splitTextToSize(`${label}: ${value || "-"}`, 180);
    docPDF.text(lines, 15, y);
    y += lines.length * 7;
  };
  const addSection = (title) => {
    y += 5;
    docPDF.setFont("helvetica", "bold");
    docPDF.setTextColor(0, 59, 113);
    docPDF.text(title, 15, y);
    docPDF.setTextColor(0, 0, 0);
    docPDF.setFont("helvetica", "normal");
    y += 8;
  };

  docPDF.setFont("helvetica", "bold");
  docPDF.text("SOLICITACAO DE PASSAGENS E DIARIAS", 15, y);
  y += 10;
  docPDF.setFont("helvetica", "normal");
  addText("Codigo", data.id);
  addText("Data de envio", data.createdAtClient);
  addSection("Seção 1 - Cadastro do Evento");
  addText("Descrição", data.descricaoSolicitacao);
  addText("Nome do Evento", data.nomeEvento);
  addText("Data do Evento", formatDate(data.dataEvento));
  addText("Local", data.localEvento);
  addText("Justificativa", data.justificativa);
  addSection("Seção 2 - Projeto Vinculado");
  addText("ID FIOTEC", data.idFiotec);
  addText("Projeto ID", data.metaProjeto);
  addText("Coordenador", data.coordenador);
  addText("Setor", data.setorFiocruz);
  addSection("Seção 3 - Viajante");
  addText("Nome", data.nomeCompleto);
  addText("Nascimento", formatDate(data.dataNascimento));
  addText("Cargo", data.cargoFuncao);
  addText("CPF", data.cpf);
  addText("Banco", data.banco);
  addText("Agência", data.agencia);
  addText("Conta", data.contaCorrente);
  addSection("Seção 4 - Solicitação");
  addText("Necessidade", data.necessidade);
  addText("Origem", data.localOrigem);
  addText("Data Ida", formatDate(data.dataIda));
  addText("Horário Ida", data.horarioIda);
  addText("Voo Ida", data.vooIda);
  addText("Destino", data.localDestino);
  addText("Data Volta", formatDate(data.dataVolta));
  addText("Horário Volta", data.horarioVolta);
  addText("Valor máximo diária", data.necessarioValorMaximoDiaria);
  addText("Valor máximo", data.valorMaximoDiaria);
  docPDF.save(`solicitacao_${data.id}.pdf`);
}

function createdAtDisplay(item) {
  return item.createdAtClient || item.createdAtIso || item.createdAt || "-";
}

function displayValue(key, item) {
  if (key === "createdAt") return createdAtDisplay(item);
  if (["dataEvento", "dataNascimento", "dataIda", "dataVolta"].includes(key))
    return formatDate(item[key]) || "-";
  return item[key] || "-";
}

function fieldLabel(field) {
  const index = requestFields.indexOf(field);
  return csvHeaders[index] || field;
}

function auditTitle(item) {
  return (
    normalizeText(item.nomeCompleto) ||
    normalizeText(item.nomeEvento) ||
    "Solicitação sem título"
  );
}

function sameAuditValue(field, previous, next) {
  return (
    normalizeText(displayValue(field, previous)) ===
    normalizeText(displayValue(field, next))
  );
}

function buildAuditEntry(data, overrides = {}) {
  const id = createAuditId();
  const now = new Date();
  const user = currentUser();
  return {
    id,
    titulo: auditTitle(data),
    idAlteracao: id,
    idChamado: data.id,
    tipoAlteracao: "EDIÇÃO",
    motivoAlteracao: "Formulário atualizado",
    dataAlteracao: now.toISOString(),
    dataAlteracaoClient: now.toLocaleString("pt-BR"),
    campoAlterado: "-",
    alteradoPor: user.login || "usuário do formulário",
    valorOriginal: "-",
    valorNovo: "-",
    origem: "Formulário",
    observacao: "Registro automático do sistema.",
    ...overrides,
  };
}

function buildCreationAudit(data) {
  return [
    buildAuditEntry(data, {
      tipoAlteracao: "CRIAÇÃO",
      motivoAlteracao: "Novo formulário enviado",
      campoAlterado: "Formulário",
      valorNovo: data.status || "Recebida",
      origem: "Formulário público",
      observacao:
        "Nova solicitação disponível para todos os usuários administrativos.",
    }),
  ];
}

function buildChangeAuditLogs(previous, next) {
  const ignoredFields = new Set(["id", "createdAt", "status"]);
  return requestFields
    .filter(
      (field) =>
        !ignoredFields.has(field) && !sameAuditValue(field, previous, next),
    )
    .map((field) =>
      buildAuditEntry(next, {
        campoAlterado: fieldLabel(field),
        valorOriginal: displayValue(field, previous),
        valorNovo: displayValue(field, next),
        origem: "Edição de formulário",
        observacao: "Alteração registrada automaticamente ao salvar a edição.",
      }),
    );
}

async function saveAuditLogs(logs) {
  await Promise.all(
    logs.map((log) => setDoc(doc(db, COLLECTION_ALTERACOES, log.id), log)),
  );
}

function setSelectValue(select, value) {
  const normalized = normalizeText(value).toUpperCase();
  const option = Array.from(select.options).find(
    (item) =>
      normalizeText(item.value || item.textContent).toUpperCase() ===
      normalized,
  );
  select.value = option ? option.value : "";
}

function fillRequestForm(item) {
  const form = document.getElementById("requestForm");
  requestFields.forEach((key) => {
    if (key === "id" || key === "createdAt" || key === "status") return;
    const field = form.elements[key];
    if (!field) return;
    if (field.tagName === "SELECT") setSelectValue(field, item[key]);
    else field.value = item[key] || "";
  });
  applyLinkedProject();
  updateDailyLimitField();
  if (requiresDailyLimit(item.necessarioValorMaximoDiaria)) {
    form.elements.valorMaximoDiaria.value = item.valorMaximoDiaria || "";
  }
}

function setEditingRequest(item) {
  state.editingRequest = item;
  document.getElementById("editRequestId").value = item?.id || "";
  document.getElementById("cancelEditButton").classList.toggle("hidden", !item);
  document.getElementById("requestSubmitButton").textContent = item
    ? "Salvar alterações e gerar PDF"
    : "Enviar, salvar e gerar PDF";
}

function clearEditingRequest() {
  state.editingRequest = null;
  document.getElementById("editRequestId").value = "";
  document.getElementById("cancelEditButton").classList.add("hidden");
  document.getElementById("requestSubmitButton").textContent =
    "Enviar, salvar e gerar PDF";
}

async function loadRequestForEditing(id) {
  const request = await findRequestById(id);
  if (!request)
    throw new Error("Nenhuma solicitação foi encontrada com este ID.");
  fillRequestForm(request);
  setEditingRequest(request);
  showPage("form");
  showMessage(
    "formMessage",
    `Solicitação ${escapeHTML(request.id)} carregada para edição. Ao salvar, o mesmo ID será atualizado.`,
  );
}

function countByNeed(term) {
  return state.allResponses.filter((item) =>
    String(item.necessidade || "")
      .toLowerCase()
      .includes(term),
  ).length;
}

function parseMoneyValue(value) {
  let normalized = String(value || "").replace(/[^\d.,]/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (
    (normalized.match(/\./g) || []).length > 1 ||
    /\.\d{3}$/.test(normalized)
  ) {
    normalized = normalized.replace(/\./g, "");
  }
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function requiresDailyLimit(value) {
  return normalizeText(value).toUpperCase() === "SIM";
}

function formatMoneyInputValue(value) {
  const number = parseMoneyValue(value);
  return number > 0 ? formatCurrency(number) : "";
}

function sanitizeMoneyInput(event) {
  event.target.value = event.target.value.replace(/[^\d.,]/g, "");
}

function formatDailyLimitField() {
  const input = document.getElementById("valorMaximoDiaria");
  const formatted = formatMoneyInputValue(input.value);
  if (formatted) input.value = formatted;
}

function updateDailyLimitField() {
  const select = document.getElementById("necessarioValorMaximoDiaria");
  const input = document.getElementById("valorMaximoDiaria");
  const hint = document.getElementById("dailyLimitHint");
  const enabled = requiresDailyLimit(select.value);

  input.disabled = !enabled;
  input.required = enabled;
  if (!enabled) input.value = "";
  hint.textContent = enabled
    ? "Informe o valor em reais. Exemplo: 350,00 ou 1.250,50."
    : 'Selecione "SIM" no campo 25 para informar o valor em dinheiro.';
}

function buildRoute(item) {
  const origin = normalizeText(item.localOrigem);
  const destination = normalizeText(item.localDestino);
  return origin && destination
    ? `${origin} → ${destination}`
    : "Rota não informada";
}

function renderInsightList(targetId, items, emptyText) {
  const target = document.getElementById(targetId);
  target.innerHTML = items.length
    ? items
        .map(
          (item) =>
            `<div class="insight-list-item"><div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.description)}</span></div><strong>${escapeHTML(item.value)}</strong></div>`,
        )
        .join("")
    : `<div class="insight-list-item"><div><strong>${emptyText}</strong><span>Os dados aparecerão quando houver solicitações cadastradas.</span></div><strong>-</strong></div>`;
}

function requestDate(item) {
  const rawDate = item.createdAtIso || item.createdAt || item.createdAtClient;
  if (!rawDate) return null;
  const date = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chartDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function renderRequestsTrendChart() {
  const target = document.getElementById("requestsTrendChart");
  if (!target) return;

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return { date, total: 0 };
  });
  const totals = new Map(days.map((day) => [chartDateKey(day.date), day]));

  state.allResponses.forEach((item) => {
    const date = requestDate(item);
    if (!date) return;
    date.setHours(0, 0, 0, 0);
    const bucket = totals.get(chartDateKey(date));
    if (bucket) bucket.total += 1;
  });

  const max = Math.max(1, ...days.map((day) => day.total));
  target.innerHTML = days
    .map((day) => {
      const height = Math.max(4, Math.round((day.total / max) * 100));
      const label = day.date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      return `
      <div class="bar-item">
        <div class="bar-track"><span class="bar-fill" style="height:${height}%"></span></div>
        <div class="bar-label"><strong>${day.total}</strong><span>${label}</span></div>
      </div>
    `;
    })
    .join("");
}

function requestTypeBuckets() {
  return state.allResponses.reduce(
    (totals, item) => {
      const need = String(item.necessidade || "").toLowerCase();
      const hasPassage = need.includes("passagens");
      const hasDaily = need.includes("diárias") || need.includes("diarias");
      if (hasPassage && hasDaily) totals.both += 1;
      else if (hasPassage) totals.passage += 1;
      else if (hasDaily) totals.daily += 1;
      return totals;
    },
    { passage: 0, daily: 0, both: 0 },
  );
}

function renderRequestTypeChart(typeTotals) {
  const target = document.getElementById("requestTypeChart");
  if (!target) return;

  const total = typeTotals.passage + typeTotals.daily + typeTotals.both;
  const passagePercent = total
    ? Math.round((typeTotals.passage / total) * 100)
    : 0;
  const comboPercent = total
    ? Math.round(((typeTotals.passage + typeTotals.both) / total) * 100)
    : 0;
  target.innerHTML = `
    <div class="donut-visual" style="--passage-percent:${passagePercent}%; --combo-percent:${comboPercent}%" data-total="${total}"></div>
    <div class="chart-legend">
      <div class="legend-row"><span><i class="legend-dot"></i>Somente passagens</span><strong>${typeTotals.passage}</strong></div>
      <div class="legend-row"><span><i class="legend-dot green"></i>Passagens e diárias</span><strong>${typeTotals.both}</strong></div>
      <div class="legend-row"><span><i class="legend-dot gold"></i>Somente diárias</span><strong>${typeTotals.daily}</strong></div>
    </div>
  `;
}

function renderProjectBarChart(sortedProjects) {
  const target = document.getElementById("projectBarChart");
  if (!target) return;
  const projects = sortedProjects.slice(0, 5);
  const max = Math.max(1, ...projects.map(([, value]) => value));

  target.innerHTML = projects.length
    ? projects
        .map(([project, value]) => {
          const width = Math.max(4, Math.round((value / max) * 100));
          return `
        <div class="horizontal-item">
          <span title="${escapeHTML(project)}">${escapeHTML(project)}</span>
          <div class="horizontal-track"><div class="horizontal-fill" style="width:${width}%"></div></div>
          <strong class="horizontal-value">${formatCurrency(value)}</strong>
        </div>
      `;
        })
        .join("")
    : `<div class="empty-records">Nenhum valor de diária informado.</div>`;
}

function renderAdminInsights() {
  const valuedRequests = state.allResponses
    .map((item) => ({ item, value: parseMoneyValue(item.valorMaximoDiaria) }))
    .filter((entry) => entry.value > 0);
  const totalDailyLimit = valuedRequests.reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
  const averageDailyLimit = valuedRequests.length
    ? totalDailyLimit / valuedRequests.length
    : 0;
  const projectTotals = new Map();

  valuedRequests.forEach(({ item, value }) => {
    const project =
      item.metaProjeto || item.idFiotec || "Projeto não informado";
    projectTotals.set(project, (projectTotals.get(project) || 0) + value);
  });

  const sortedProjects = Array.from(projectTotals.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const topProject = sortedProjects[0];
  const flightRequests = state.allResponses.filter((item) =>
    String(item.necessidade || "")
      .toLowerCase()
      .includes("passagens"),
  );
  const requestsWithFlight = state.allResponses.filter((item) =>
    normalizeText(item.vooIda),
  ).length;
  const missingFlightInfo = flightRequests.filter(
    (item) => !normalizeText(item.vooIda),
  ).length;
  const routeTotals = new Map();

  state.allResponses.forEach((item) => {
    const route = buildRoute(item);
    if (route !== "Rota não informada")
      routeTotals.set(route, (routeTotals.get(route) || 0) + 1);
  });

  const sortedRoutes = Array.from(routeTotals.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const mostCommonRoute = sortedRoutes[0];
  const typeTotals = requestTypeBuckets();

  document.getElementById("totalDailyLimit").textContent =
    formatCurrency(totalDailyLimit);
  document.getElementById("requestsWithDailyLimit").textContent = String(
    valuedRequests.length,
  );
  document.getElementById("averageDailyLimit").textContent =
    formatCurrency(averageDailyLimit);
  document.getElementById("topProjectCost").textContent = topProject
    ? `${topProject[0]} (${formatCurrency(topProject[1])})`
    : "-";
  document.getElementById("requestsWithFlight").textContent =
    String(requestsWithFlight);
  document.getElementById("uniqueRoutes").textContent = String(
    routeTotals.size,
  );
  document.getElementById("mostCommonRoute").textContent = mostCommonRoute
    ? `${mostCommonRoute[0]} (${mostCommonRoute[1]})`
    : "-";
  document.getElementById("missingFlightInfo").textContent =
    String(missingFlightInfo);
  document.getElementById("dashboardTotalDailyLimit").textContent =
    formatCurrency(totalDailyLimit);
  document.getElementById("dashboardRequestsWithValue").textContent = String(
    valuedRequests.length,
  );
  document.getElementById("dashboardAverageDailyLimit").textContent =
    formatCurrency(averageDailyLimit);

  renderRequestsTrendChart();
  renderRequestTypeChart(typeTotals);
  renderProjectBarChart(sortedProjects);

  renderInsightList(
    "projectCostList",
    sortedProjects.slice(0, 5).map(([project, value]) => ({
      title: project,
      description: "Total estimado por projeto/meta",
      value: formatCurrency(value),
    })),
    "Nenhum valor de diária identificado",
  );

  renderInsightList(
    "flightRouteList",
    sortedRoutes.slice(0, 5).map(([route, total]) => ({
      title: route,
      description: "Quantidade de solicitações nesta rota",
      value: `${total} pedido(s)`,
    })),
    "Nenhuma rota cadastrada",
  );
}

function updateDashboard() {
  document.getElementById("totalRequests").textContent =
    state.allResponses.length;
  document.getElementById("lastRequest").textContent = state.allResponses.length
    ? createdAtDisplay(state.allResponses[0])
    : "-";
  document.getElementById("pendingRequests").textContent =
    state.allResponses.filter(
      (item) => (item.status || "Recebida") === "Recebida",
    ).length;
  document.getElementById("passageRequests").textContent =
    countByNeed("passagens");
  document.getElementById("dailyRequests").textContent = countByNeed("diárias");
  renderAdminInsights();
}

function renderTableHeader() {
  return null;
}

function isToday(value) {
  if (!value) return false;
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function renderAuditTable(logs) {
  if (!logs.length) {
    return `<div class="empty-records">Nenhuma alteração registrada hoje.</div>`;
  }

  return `
    <div class="audit-table-wrapper">
      <table class="audit-table">
        <thead>
          <tr>${auditColumns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${logs
            .map(
              (log) => `
            <tr>
              ${auditColumns.map((column) => `<td>${escapeHTML(log[column.key])}</td>`).join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderNotifications(logs) {
  const target = document.getElementById("notificationsList");
  if (!target) return;
  const recentLogs = logs.slice(0, 6);

  target.innerHTML = recentLogs.length
    ? recentLogs
        .map(
          (log) => `
      <article class="notification-item">
        <span class="notification-dot"></span>
        <div>
          <strong>${escapeHTML(log.titulo)}</strong>
          <p>${escapeHTML(log.campoAlterado)}: ${escapeHTML(log.valorOriginal)} -> ${escapeHTML(log.valorNovo)}</p>
          <small>${escapeHTML(log.dataAlteracaoClient)} por ${escapeHTML(log.alteradoPor)}</small>
        </div>
      </article>
    `,
        )
        .join("")
    : `<div class="empty-records">Ainda não há notificações de alterações.</div>`;
}

function renderAuditPanel() {
  const todayLogs = state.auditLogs.filter((log) => isToday(log.dataAlteracao));
  const tableTarget = document.getElementById("changesTable");
  const countTarget = document.getElementById("todayChangesCount");
  if (countTarget) countTarget.textContent = String(todayLogs.length);
  if (tableTarget) tableTarget.innerHTML = renderAuditTable(todayLogs);
  renderNotifications(state.auditLogs);
}

function renderRecordCards() {
  const search = document
    .getElementById("adminSearch")
    .value.toLowerCase()
    .trim();
  const statusFilter =
    document.getElementById("requestStatusFilter").value ||
    state.requestStatusFilter;
  const dateFilter =
    document.getElementById("requestDateFilter").value ||
    state.requestDateFilter;
  state.requestStatusFilter = statusFilter;
  state.requestDateFilter = dateFilter;

  state.filteredResponses = search
    ? state.allResponses.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(search),
      )
    : state.allResponses;
  if (statusFilter !== "all") {
    state.filteredResponses = state.filteredResponses.filter(
      (item) => (item.status || "Recebida") === statusFilter,
    );
  }
  if (dateFilter === "today") {
    state.filteredResponses = state.filteredResponses.filter((item) =>
      isToday(item.createdAtIso || item.createdAt),
    );
  }

  const target = document.getElementById("responsesTable");
  const totalPages = Math.max(
    1,
    Math.ceil(state.filteredResponses.length / REQUESTS_PAGE_SIZE),
  );
  state.requestsPage = Math.min(Math.max(1, state.requestsPage), totalPages);
  const start = (state.requestsPage - 1) * REQUESTS_PAGE_SIZE;
  const pageRows = state.filteredResponses.slice(
    start,
    start + REQUESTS_PAGE_SIZE,
  );
  const metaTarget = document.getElementById("requestsQueueMeta");
  const paginationTarget = document.getElementById("requestsPagination");
  if (metaTarget) {
    const showingStart = state.filteredResponses.length ? start + 1 : 0;
    const showingEnd = Math.min(
      start + REQUESTS_PAGE_SIZE,
      state.filteredResponses.length,
    );
    metaTarget.textContent = `${showingStart}-${showingEnd} de ${state.filteredResponses.length} registro(s)`;
  }
  if (paginationTarget) {
    paginationTarget.innerHTML = `
      <span>Página ${state.requestsPage} de ${totalPages}</span>
      <div class="pagination-actions">
        <button type="button" class="btn-ghost" data-page-prev ${state.requestsPage <= 1 ? "disabled" : ""}>Anterior</button>
        <button type="button" class="btn-ghost" data-page-next ${state.requestsPage >= totalPages ? "disabled" : ""}>Próxima</button>
      </div>
    `;
  }
  if (!state.filteredResponses.length) {
    target.innerHTML = `<div class="empty-records">Nenhuma solicitação encontrada.</div>`;
    return;
  }

  const groups = [
    {
      title: "Evento",
      fields: [
        "descricaoSolicitacao",
        "nomeEvento",
        "dataEvento",
        "localEvento",
      ],
    },
    { title: "Projeto", fields: ["idFiotec", "metaProjeto", "coordenador"] },
    {
      title: "Viajante",
      fields: ["nomeCompleto", "cpf", "cargoFuncao", "banco"],
    },
    {
      title: "Viagem",
      fields: [
        "necessidade",
        "localOrigem",
        "localDestino",
        "dataIda",
        "dataVolta",
        "vooIda",
        "valorMaximoDiaria",
      ],
    },
  ];
  const labelByField = Object.fromEntries(
    requestFields.map((field, index) => [field, csvHeaders[index] || field]),
  );

  target.innerHTML = pageRows
    .map((item) => {
      const sections = groups
        .map(
          (group) => `
      <div class="record-section">
        <strong>${escapeHTML(group.title)}</strong>
        <div class="record-fields">
          ${group.fields
            .map(
              (field) => `
            <div class="record-field">
              <span>${escapeHTML(labelByField[field])}</span>
              <b>${escapeHTML(displayValue(field, item))}</b>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `,
        )
        .join("");

      return `
      <article class="record-card">
        <div class="record-card-header">
          <div>
            <span class="record-id">${escapeHTML(item.id)}</span>
            <h4>${escapeHTML(item.nomeCompleto || item.nomeEvento || "Solicitação sem nome")}</h4>
            <small>${escapeHTML(createdAtDisplay(item))}${item.updatedAtClient ? ` | Atualizada em ${escapeHTML(item.updatedAtClient)}` : ""}</small>
          </div>
          <span class="status-pill">${escapeHTML(item.status || "Recebida")}</span>
        </div>
        <div class="record-card-body">${sections}</div>
        <div class="record-actions">
          <button type="button" data-edit="${escapeHTML(item.id)}">Editar</button>
          <button type="button" class="btn-secondary" data-pdf="${escapeHTML(item.id)}">PDF</button>
          <button type="button" class="btn-danger" data-delete="${escapeHTML(item.id)}">Apagar</button>
        </div>
      </article>
    `;
    })
    .join("");
}

function renderTable() {
  renderRecordCards();
}

async function loadRequests() {
  try {
    const q = query(
      collection(db, COLLECTION_SOLICITACOES),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);
    const auditQuery = query(
      collection(db, COLLECTION_ALTERACOES),
      orderBy("dataAlteracao", "desc"),
    );
    const auditSnapshot = await getDocs(auditQuery);
    state.allResponses = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
    state.auditLogs = auditSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
    updateDashboard();
    renderAuditPanel();
    renderTable();
  } catch (error) {
    if (
      usingApiDatabase() &&
      String(error.message || "")
        .toLowerCase()
        .includes("sessao")
    ) {
      await signOut(auth);
      showPage("login");
      showMessage(
        "loginMessage",
        "Sua sessão expirou. Faça login novamente.",
        "error",
      );
      return;
    }
    throw error;
  }
}

function convertRowsToCSV(rows) {
  const headerLine = csvHeaders
    .map((header) => `"${String(header).replace(/"/g, '""')}"`)
    .join(",");
  const body = rows.map((item) =>
    requestFields
      .map((key) => `"${String(displayValue(key, item)).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headerLine].concat(body).join("\n");
}

function exportCSV() {
  const rows = state.filteredResponses.length
    ? state.filteredResponses
    : state.allResponses;
  if (!rows.length) return alert("Não há dados para exportar.");
  const csv = convertRowsToCSV(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "solicitacoes_passagens_diarias.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function deleteRequest(id) {
  if (!confirm("Tem certeza que deseja apagar este registro")) return;
  await deleteDoc(doc(db, COLLECTION_SOLICITACOES, id));
  await loadRequests();
}

async function logout() {
  await signOut(auth);
  showPage("home");
}

async function validateAdminSession() {
  const session = savedSession();
  if (!session.login) return false;
  if (!usingApiDatabase()) return true;
  if (!session.token) return false;

  try {
    await apiRequest("/auth/me");
    return true;
  } catch (error) {
    if (storageAvailable())
      window.localStorage.removeItem(STORAGE_KEYS.session);
    return false;
  }
}

async function openAdminArea() {
  if (await validateAdminSession()) {
    showPage("admin");
    return;
  }
  showPage("login");
}

async function initializeBackend() {
  if (usingCloudDatabase()) {
    updateStorageStatus();
    return;
  }
  try {
    await apiRequest("/health");
    db.api = true;
    db.mode = "backend-api";
  } catch (error) {
    db.api = false;
    db.mode = "internal-local-storage";
  }
  updateStorageStatus();
  await validateAdminSession();
}

document
  .getElementById("chooseAdminButton")
  .addEventListener("click", openAdminArea);
document.getElementById("chooseFormButton").addEventListener("click", () => {
  document.getElementById("requestForm").reset();
  clearEditingRequest();
  updateDailyLimitField();
  showPage("form");
});
document
  .querySelectorAll("[data-page]")
  .forEach((button) =>
    button.addEventListener("click", () => showPage(button.dataset.page)),
  );
document
  .querySelectorAll("[data-admin-tab]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      switchAdminTab(button.dataset.adminTab),
    ),
  );
document
  .querySelectorAll("[data-export]")
  .forEach((button) => button.addEventListener("click", exportCSV));
document
  .querySelectorAll("[data-logout]")
  .forEach((button) => button.addEventListener("click", logout));
document
  .getElementById("refreshButton")
  .addEventListener("click", loadRequests);
document.getElementById("adminSearch").addEventListener("input", renderTable);
document.getElementById("clearSearchButton").addEventListener("click", () => {
  document.getElementById("adminSearch").value = "";
  state.requestsPage = 1;
  renderTable();
});
document
  .getElementById("requestStatusFilter")
  .addEventListener("change", () => {
    state.requestsPage = 1;
    renderTable();
  });
document.getElementById("requestDateFilter").addEventListener("change", () => {
  state.requestsPage = 1;
  renderTable();
});
document
  .getElementById("requestsPagination")
  .addEventListener("click", (event) => {
    if (event.target.dataset.pagePrev !== undefined) state.requestsPage -= 1;
    if (event.target.dataset.pageNext !== undefined) state.requestsPage += 1;
    renderTable();
  });
document
  .getElementById("loadEditRequestButton")
  .addEventListener("click", async () => {
    try {
      await loadRequestForEditing(
        document.getElementById("editRequestId").value,
      );
    } catch (error) {
      showMessage(
        "formMessage",
        error.message || "Erro ao carregar solicitação para edição.",
        "error",
      );
    }
  });
document.getElementById("cancelEditButton").addEventListener("click", () => {
  document.getElementById("requestForm").reset();
  clearEditingRequest();
  document.getElementById("projectFeedback").textContent =
    "Digite ou selecione um ID FIOTEC.";
  updateDailyLimitField();
  showMessage(
    "formMessage",
    "Edição cancelada. O próximo envio criará uma nova solicitação.",
    "warning",
  );
});

document
  .getElementById("idFiotec")
  .addEventListener("input", applyLinkedProject);
document
  .getElementById("idFiotec")
  .addEventListener("change", applyLinkedProject);
document
  .getElementById("idFiotec")
  .addEventListener("blur", applyLinkedProject);
document
  .getElementById("necessarioValorMaximoDiaria")
  .addEventListener("change", updateDailyLimitField);
document
  .getElementById("valorMaximoDiaria")
  .addEventListener("input", sanitizeMoneyInput);
document
  .getElementById("valorMaximoDiaria")
  .addEventListener("blur", formatDailyLimitField);

document
  .getElementById("loginForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const login = document.getElementById("login").value.trim();
      const password = document.getElementById("password").value;
      await signInWithEmailAndPassword(auth, login, password);
      document.getElementById("loginMessage").innerHTML = "";
      showPage("admin");
    } catch (error) {
      showMessage(
        "loginMessage",
        error.message || "Login ou senha inválidos.",
        "error",
      );
    }
  });

document
  .getElementById("requestForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector("button[type='submit']");
    const originalText = submitButton.textContent;
    try {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
      const wasEditing = Boolean(state.editingRequest);
      const previousData = state.editingRequest
        ? { ...state.editingRequest }
        : null;
      const data = buildRequestObject(form, state.editingRequest);
      const auditLogs = wasEditing
        ? buildChangeAuditLogs(previousData, data)
        : buildCreationAudit(data);
      await setDoc(doc(db, COLLECTION_SOLICITACOES, data.id), data);
      if (auditLogs.length) await saveAuditLogs(auditLogs);
      generatePDF(data);
      if (wasEditing)
        showMessage(
          "formMessage",
          `Solicitação atualizada com sucesso. ${auditLogs.length} alteração(ões) registrada(s) no painel administrativo.`,
        );
      if (!wasEditing)
        showMessage(
          "formMessage",
          "Solicitação enviada com sucesso. O PDF foi gerado e o registro foi salvo no banco interno.",
        );
      form.reset();
      clearEditingRequest();
      document.getElementById("projectFeedback").textContent =
        "Digite ou selecione um ID FIOTEC.";
      updateDailyLimitField();
    } catch (error) {
      showMessage(
        "formMessage",
        error.message || "Erro ao salvar solicitação.",
        "error",
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = state.editingRequest
        ? originalText
        : "Enviar, salvar e gerar PDF";
    }
  });

document
  .getElementById("responsesTable")
  .addEventListener("click", async (event) => {
    const editId = event.target.dataset.edit;
    const pdfId = event.target.dataset.pdf;
    const deleteId = event.target.dataset.delete;
    if (editId) await loadRequestForEditing(editId);
    if (pdfId)
      generatePDF(state.allResponses.find((item) => item.id === pdfId));
    if (deleteId) await deleteRequest(deleteId);
  });

populateProjectDatalist();
populateBankDatalist();
updateDailyLimitField();
renderTableHeader();
getAdminUsers();
switchAdminTab(state.activeAdminTab);
initializeBackend();
showPage("home");

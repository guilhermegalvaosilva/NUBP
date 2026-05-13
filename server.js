const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID, randomBytes, pbkdf2Sync, timingSafeEqual } = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ADMIN_PASSWORD = "123456";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function defaultDb() {
  return {
    solicitacoes: [],
    alteracoes: [],
    admins: [createAdminRecord("admin", DEFAULT_ADMIN_PASSWORD, "padrao")],
    sessions: [],
  };
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  const db = JSON.parse(raw || "{}");
  db.solicitacoes = Array.isArray(db.solicitacoes) ? db.solicitacoes : [];
  db.alteracoes = Array.isArray(db.alteracoes) ? db.alteracoes : [];
  db.admins = Array.isArray(db.admins) && db.admins.length ? db.admins : [createAdminRecord("admin", DEFAULT_ADMIN_PASSWORD, "padrao")];
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];

  let changed = false;
  db.admins = db.admins.map((admin) => {
    if (admin.passwordHash) return admin;
    changed = true;
    return createAdminRecord(admin.login, admin.password || DEFAULT_ADMIN_PASSWORD, admin.createdAt || new Date().toLocaleString("pt-BR"));
  });
  db.sessions = db.sessions.filter((session) => {
    const valid = Number(session.expiresAt || 0) > Date.now();
    if (!valid) changed = true;
    return valid;
  });
  if (changed) await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

async function writeDb(db) {
  await ensureDb();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(":")[1];
  const hashBuffer = Buffer.from(hash, "hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  return hashBuffer.length === candidateBuffer.length && timingSafeEqual(hashBuffer, candidateBuffer);
}

function createAdminRecord(login, password, createdAt = new Date().toLocaleString("pt-BR")) {
  return {
    id: randomUUID(),
    login: normalizeLogin(login),
    passwordHash: hashPassword(password),
    createdAt,
  };
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    login: admin.login,
    createdAt: admin.createdAt,
  };
}

function createSession(login) {
  return {
    token: `${randomUUID()}${randomUUID()}`.replace(/-/g, ""),
    login,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : "";
}

async function requireAuth(req, res) {
  const token = bearerToken(req);
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token && Number(item.expiresAt || 0) > Date.now());
  if (!session) {
    sendJson(res, 401, { error: "Sessao expirada. Faça login novamente." });
    return null;
  }
  const user = db.admins.find((admin) => normalizeLogin(admin.login) === normalizeLogin(session.login));
  if (!user) {
    sendJson(res, 401, { error: "Usuario administrativo nao encontrado." });
    return null;
  }
  return { db, user, session };
}

function collectionNameFromUrl(pathname) {
  if (pathname.startsWith("/api/solicitacoes")) return "solicitacoes";
  if (pathname.startsWith("/api/alteracoes")) return "alteracoes";
  return null;
}

function sortRows(rows, query) {
  const sortField = query.get("sort") || "createdAt";
  const direction = query.get("order") === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => String(a[sortField] || "").localeCompare(String(b[sortField] || "")) * direction);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requestIdFromPath(pathname, prefix) {
  const id = pathname.slice(prefix.length).replace(/^\/+/, "");
  return id ? decodeURIComponent(id) : "";
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, mode: "backend-api" });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const db = await readDb();
    const user = db.admins.find((item) => normalizeLogin(item.login) === normalizeLogin(body.login) && verifyPassword(body.password, item.passwordHash));
    if (!user) return sendJson(res, 401, { error: "Login ou senha invalidos." });
    const session = createSession(user.login);
    db.sessions.push(session);
    await writeDb(db);
    sendJson(res, 200, { token: session.token, expiresAt: session.expiresAt, user: publicAdmin(user) });
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, { user: publicAdmin(authContext.user), expiresAt: authContext.session.expiresAt });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const token = bearerToken(req);
    const db = await readDb();
    db.sessions = db.sessions.filter((session) => session.token !== token);
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/admins" && req.method === "GET") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, { data: authContext.db.admins.map(publicAdmin) });
    return;
  }

  if (url.pathname === "/api/admins" && req.method === "POST") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    const body = await readBody(req);
    const login = normalizeLogin(body.login);
    const password = String(body.password || "").trim();
    if (!login) return sendJson(res, 400, { error: "Informe um login." });
    if (password.length < 6) return sendJson(res, 400, { error: "A senha precisa ter pelo menos 6 caracteres." });
    if (authContext.db.admins.some((admin) => normalizeLogin(admin.login) === login)) {
      return sendJson(res, 409, { error: "Este login ja esta cadastrado." });
    }
    const user = createAdminRecord(login, password);
    authContext.db.admins.push(user);
    await writeDb(authContext.db);
    sendJson(res, 201, { user: publicAdmin(user) });
    return;
  }

  const collection = collectionNameFromUrl(url.pathname);
  if (!collection) {
    sendJson(res, 404, { error: "Rota nao encontrada." });
    return;
  }

  const db = await readDb();
  const prefix = `/api/${collection}`;
  const id = requestIdFromPath(url.pathname, prefix);

  if (req.method === "GET" && !id) {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, { data: sortRows(db[collection], url.searchParams) });
    return;
  }

  if (req.method === "GET" && id) {
    const item = db[collection].find((row) => String(row.id).toUpperCase() === id.toUpperCase());
    if (!item) return sendJson(res, 404, { error: "Registro nao encontrado." });
    sendJson(res, 200, { data: item });
    return;
  }

  if ((req.method === "POST" && !id) || (req.method === "PUT" && id)) {
    const body = await readBody(req);
    const rowId = id || body.id || randomUUID();
    const row = { ...body, id: rowId };
    const index = db[collection].findIndex((item) => String(item.id) === String(rowId));
    if (index >= 0) db[collection][index] = row;
    else db[collection].push(row);
    await writeDb(db);
    sendJson(res, index >= 0 ? 200 : 201, { data: row });
    return;
  }

  if (req.method === "DELETE" && id) {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    const before = db[collection].length;
    db[collection] = db[collection].filter((item) => String(item.id) !== String(id));
    await writeDb(db);
    sendJson(res, 200, { deleted: before !== db[collection].length });
    return;
  }

  sendJson(res, 405, { error: "Metodo nao permitido." });
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT_DIR, requestedPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Acesso negado.");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Arquivo nao encontrado.");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erro interno." });
  }
});

server.listen(PORT, () => {
  console.log(`Servidor NUGP rodando em http://localhost:${PORT}`);
});

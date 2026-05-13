# Formulário de Solicitação de Passagens e Diárias

Projeto em HTML, CSS e JavaScript puro, com backend Node.js sem dependências externas.

## Estrutura

```text
NUBP-main/
- index.html       # Telas: Home, Login, Formulário e Admin
- css/style.css    # Estilos visuais do sistema
- js/app.js        # Regras, formulário, admin, PDF, CSV e integração com a API
- server.js        # Backend Node.js com rotas REST
- package.json     # Script npm start
- README.md
```

## Funcionalidades

- Home de escolha entre Área Administrativa e Responder Formulário.
- Login administrativo com senha em hash e sessão por token.
- Formulário público para solicitações de passagens e diárias.
- Backend local com dados salvos em `data/db.json`.
- Fallback para `localStorage` quando o backend não estiver rodando.
- Painel administrativo com sidebar por abas: Dashboard, Alterações, Notificações, Financeiro, Voos e Solicitações.
- Fila de solicitações com busca, filtro por status, filtro por período e paginação.
- Histórico de alterações com tabela diária e notificações visíveis para todos os usuários administrativos.
- Exportação CSV, geração de PDF e exclusão de registros.

## Como usar

1. Rode `npm start`.
2. Acesse `http://localhost:3000`.
3. Na Home, escolha **Responder Formulário** para enviar uma solicitação.
4. Na Home, escolha **Área Administrativa** para entrar no painel.
5. Use o login `admin` e a senha `123456`.

Depois do login, o backend cria uma sessão temporária e o painel envia o token nas chamadas administrativas. A listagem geral, exclusões e rotas de usuários administrativos exigem autenticação.

Também é possível abrir `index.html` diretamente no navegador, mas nesse modo os dados ficam no `localStorage` do navegador.

## Rotas do backend

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/admins`
- `POST /api/admins`
- `GET /api/solicitacoes`
- `GET /api/solicitacoes/:id`
- `POST /api/solicitacoes`
- `PUT /api/solicitacoes/:id`
- `DELETE /api/solicitacoes/:id`
- `GET /api/alteracoes`
- `GET /api/alteracoes/:id`
- `POST /api/alteracoes`
- `PUT /api/alteracoes/:id`
- `DELETE /api/alteracoes/:id`

## Observação Sobre os Dados

Com backend, as solicitações e alterações ficam em `data/db.json`, compartilhadas para todos que acessarem o mesmo servidor. Sem backend, cada navegador terá seu próprio banco interno.

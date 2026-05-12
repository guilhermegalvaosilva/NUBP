# Formulário de Solicitação de Passagens e Diárias

Projeto em **HTML, CSS e JavaScript puro**, sem React e sem etapa de build.

## Estrutura

```text
Formulario-demanda/
├── index.html   # Estrutura das telas: Home, Login, Formulário e Admin
├── style.css    # Estilos visuais do sistema
├── app.js       # Regras, banco interno, formulário, admin, PDF e CSV
└── README.md
```

## Funcionalidades

- **Home de escolha:** primeira tela para escolher entre Área Administrativa e Responder Formulário.
- **Login simples:** acesso administrativo com `admin` / `123456`.
- **Formulário público:** cadastro de solicitações de passagens e diárias.
- **Banco interno:** dados salvos no `localStorage` do navegador.
- **Painel administrativo:** listagem completa, pesquisa, exportação CSV, geração de PDF e exclusão de registros.
- **Resumo de gastos abaixo do dashboard:** cartões para somar valores informados de diárias e agrupar estimativas por projeto/meta.
- **Informações de voos abaixo do dashboard:** cartões para acompanhar rotas, pedidos com indicação de voo e passagens sem voo indicado.
- **Catálogo de projetos:** preenchimento automático de meta, coordenador e setor pelo ID FIOTEC.

## Como usar

1. Abra `index.html` no navegador ou publique os três arquivos em um servidor estático.
2. Na Home, escolha **Responder Formulário** para enviar uma solicitação.
3. Na Home, escolha **Área Administrativa** para entrar no painel.
4. Use o login `admin` e a senha `123456`.
5. No painel, veja os resumos de Gastos e Voos logo abaixo dos cartões principais do Dashboard.

## Observação sobre o banco interno

Os dados ficam salvos no navegador em uso. Se você limpar os dados do navegador, trocar de navegador ou abrir em outro computador, o banco será diferente.
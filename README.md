# TagReativa

Tag com QR code para pets. O tutor cadastra o animal, imprime o QR code e prende na coleira. Quem encontra o pet escaneia o código, vê os dados do animal e, se ele estiver marcado como perdido, o tutor recebe um alerta com a localização por Telegram e e-mail.

## Como funciona

1. O tutor cria a conta, vincula o Telegram e cadastra os pets.
2. Cada pet recebe um QR code único que aponta para `/scan/:petId`.
3. Quem encontra o animal escaneia o código. A página pública pede consentimento para usar o GPS; se a pessoa negar, a localização é estimada pelo IP.
4. Todo scan é registrado. Se o pet estiver com status **perdido**, o tutor é avisado por Telegram (mensagem + pino no mapa) e por e-mail, e a página mostra o nome do tutor e um link de WhatsApp para contato.
5. O tutor acompanha o histórico de scans e muda o status do pet pelo painel.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Backend | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16, Passport JWT, bcrypt, Helmet, Throttler |
| Frontend | React 19, Vite 8, React Router 7, Axios, Motion, CSS Modules |
| Serviços externos | Telegram Bot API, Brevo (e-mail transacional), Cloudinary (fotos), ip-api.com (localização por IP) |
| Deploy | Frontend na Vercel; backend preparado para Render com banco Neon |

## Estrutura

```
.
├── src/                 # API NestJS
│   ├── auth/            # login, 2FA, recuperação e troca de senha
│   ├── users/           # cadastro e perfil do tutor
│   ├── pets/            # CRUD de pets, status, histórico de scans
│   ├── scan/            # rota pública de scan e disparo de alertas
│   ├── telegram/        # vínculo da conta, webhook e long polling
│   ├── email/           # envio via Brevo
│   ├── cloudinary/      # assinatura de upload de fotos
│   └── prisma/          # PrismaService
├── prisma/              # schema e migrations
├── frontend/            # aplicação React
│   └── src/
│       ├── pages/       # telas
│       ├── components/  # componentes e primitivos de UI (components/ui)
│       ├── hooks/
│       ├── services/    # cliente Axios
│       ├── styles/      # tokens e estilos globais
│       └── utils/
├── docs/superpowers/    # specs e planos de implementação
└── docker-compose.yml   # PostgreSQL local
```

## Requisitos

- Node.js 24
- Docker (para o PostgreSQL local) ou uma instância PostgreSQL
- Contas no Brevo e no Cloudinary, e um bot do Telegram criado pelo [@BotFather](https://t.me/BotFather)

## Rodando localmente

### 1. Banco de dados

```bash
docker compose up -d
```

Sobe um PostgreSQL 16 na porta `5432`, com usuário `postgres`, senha `postgres` e banco `tagreativa`.

### 2. Backend

```bash
cp .env.example .env   # preencha as variáveis (veja a tabela abaixo)
npm install
npx prisma migrate dev
npm run start:dev
```

Para o banco do Docker Compose, use:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tagreativa
```

A API sobe em `http://localhost:3000`. `GET /health` confirma que está no ar.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend sobe em `http://localhost:5173` e, sem configuração extra, chama a API em `http://localhost:3000`.

### Testando no celular pela rede local

A geolocalização do navegador só funciona em contexto seguro (HTTPS). Para testar o scan em um celular na mesma rede:

1. Gere um certificado com [mkcert](https://github.com/FiloSottile/mkcert) e salve como `frontend/.cert/cert.pem` e `frontend/.cert/key.pem`. Com esses arquivos presentes, o Vite passa a servir em HTTPS.
2. Defina `VITE_API_URL=/api` em `frontend/.env`. O Vite encaminha `/api` para `http://localhost:3000`, então o celular só conversa com o Vite.

## Variáveis de ambiente

### Backend (`.env`)

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | String de conexão do PostgreSQL |
| `JWT_SECRET` | Sim | Segredo dos tokens. Gere com `openssl rand -base64 48` |
| `FRONTEND_URL` | Sim em produção | URL pública do frontend. Usada no CORS, nos QR codes e nos links de redefinição de senha |
| `BREVO_API_KEY` | Sim | Chave da API do Brevo |
| `BREVO_SENDER_EMAIL` | Sim | Remetente verificado no Brevo |
| `CLOUDINARY_API_KEY` | Sim | Chave da API do Cloudinary |
| `CLOUDINARY_API_SECRET` | Sim | Segredo da API do Cloudinary |
| `TELEGRAM_BOT_TOKEN` | Sim | Token do bot |
| `TELEGRAM_BOT_USERNAME` | Sim | Usuário do bot, usado no link de vínculo |
| `TELEGRAM_WEBHOOK_URL` | Não | URL pública do webhook. Vazia, o backend usa long polling |
| `TELEGRAM_WEBHOOK_SECRET` | Com webhook | Segredo validado no cabeçalho do webhook |
| `TRUST_PROXY_HOPS` | Não | Número de proxies reversos na frente da API. Padrão `0` |
| `PORT` | Não | Porta da API. Padrão `3000` |

O backend não inicia se faltar `JWT_SECRET`, as chaves do Brevo, as chaves do Cloudinary ou `TELEGRAM_BOT_TOKEN`.

O nome da conta do Cloudinary e o preset de upload estão fixos em `src/cloudinary/cloudinary.service.ts`. Para usar outra conta, altere os dois valores ali.

### Frontend (`frontend/.env`)

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL base da API. Padrão `http://localhost:3000` |

## Scripts

### Backend (raiz)

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | Sobe a API com recarga automática |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda a versão compilada |
| `npm run start:deploy` | Aplica as migrations e roda a versão compilada |
| `npm test` | Testes unitários (Jest) |
| `npm run test:e2e` | Testes end-to-end |
| `npm run test:cov` | Cobertura |
| `npm run lint` | ESLint com correção automática |
| `npm run format` | Prettier |

### Frontend (`frontend/`)

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint |

## API

As rotas marcadas com JWT exigem o cabeçalho `Authorization: Bearer <token>`.

### Autenticação

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/login` | Público | Login. Com 2FA ativo, envia um código por e-mail em vez do token |
| POST | `/auth/login/verify-2fa` | Público | Valida o código e devolve o token |
| POST | `/auth/forgot-password` | Público | Envia o link de redefinição por e-mail |
| POST | `/auth/reset-password` | Público | Redefine a senha com o token do link |
| POST | `/auth/change-password` | JWT | Troca a senha informando a senha atual |
| POST | `/auth/2fa/enable` | JWT | Envia o código para ativar o 2FA |
| POST | `/auth/2fa/confirm` | JWT | Confirma o código e ativa o 2FA |
| POST | `/auth/2fa/disable` | JWT | Desativa o 2FA mediante senha |

### Usuários

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/users/register` | Público | Cadastro do tutor |
| GET | `/users/me` | JWT | Dados da conta |
| PATCH | `/users/me` | JWT | Edita o perfil mediante senha |
| DELETE | `/users/me` | JWT | Exclui a conta mediante senha |

### Pets

Todas as rotas exigem JWT.

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/pets` | Cadastra um pet |
| GET | `/pets` | Lista os pets do tutor |
| GET | `/pets/:id` | Detalhes de um pet |
| PATCH | `/pets/:id` | Edita um pet |
| PATCH | `/pets/:id/status` | Altera o status (seguro, perdido, resgate confirmado) |
| DELETE | `/pets/:id` | Remove um pet |
| GET | `/pets/:id/scans` | Histórico de scans |
| POST | `/pets/photo-upload-signature` | Assinatura para upload direto ao Cloudinary |

### Scan, Telegram e saúde

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/scan/:petId` | Público | Registra o scan e dispara os alertas |
| POST | `/telegram/link` | JWT | Gera o link para vincular o Telegram |
| DELETE | `/telegram/link` | JWT | Desvincula o Telegram |
| POST | `/telegram/webhook` | Segredo no cabeçalho | Recebe atualizações do bot |
| GET | `/health` | Público | Verificação de disponibilidade |

## Telas do frontend

| Rota | Tela |
| --- | --- |
| `/login`, `/register` | Login e cadastro |
| `/esqueci-senha`, `/redefinir-senha` | Recuperação de senha |
| `/dashboard` | Lista de pets, status e QR codes |
| `/pets/novo`, `/pets/:id/editar` | Cadastro e edição de pet |
| `/perfil` | Dados da conta |
| `/perfil/2fa` | Autenticação em dois fatores |
| `/perfil/senha` | Troca de senha |
| `/configurar-notificacao` | Vínculo com o Telegram |
| `/alertas-email` | Informações sobre os alertas por e-mail |
| `/scan/:petId` | Página pública aberta pelo QR code |

O Telegram é o canal de alerta obrigatório: as telas logadas ficam bloqueadas até o tutor vincular a conta ao bot.

## Segurança

- Senhas com hash bcrypt e política mínima de 8 caracteres, com pelo menos uma letra e um número.
- JWT com validade de 7 dias. Trocar ou redefinir a senha invalida as demais sessões.
- 2FA opcional por código de 6 dígitos enviado por e-mail, válido por 5 minutos e limitado a 5 tentativas.
- Limite global de 100 requisições por minuto por IP, com limites menores em login, cadastro, recuperação de senha, 2FA e scan.
- Alertas de scan limitados a 3 por dispositivo e 10 por pet a cada 30 minutos. O scan continua sendo registrado mesmo quando o alerta é suprimido.
- Editar o perfil, excluir a conta e desativar o 2FA exigem a senha atual.
- Upload de fotos assinado pelo backend; só são aceitas URLs da conta Cloudinary do projeto.
- Nome e contato do tutor só aparecem na página de scan quando o pet está marcado como perdido.
- Helmet e CORS restrito a `localhost:5173` e `FRONTEND_URL`.

## Deploy

**Frontend (Vercel):** aponte o projeto para a pasta `frontend/` e defina `VITE_API_URL` com a URL da API. O `vercel.json` redireciona todas as rotas para `index.html`.

**Backend (Render + Neon):**

1. Crie o banco no Neon e use a string de conexão em `DATABASE_URL`.
2. Comando de build: `npm install && npx prisma generate && npm run build`.
3. Comando de start: `npm run start:deploy`, que aplica as migrations antes de subir a API.
4. Defina as variáveis de ambiente, incluindo `FRONTEND_URL`, `TELEGRAM_WEBHOOK_URL` (`https://<sua-api>/telegram/webhook`) e `TELEGRAM_WEBHOOK_SECRET`.
5. Ajuste `TRUST_PROXY_HOPS` depois de conferir o `req.ip` em produção. Com o valor errado, todos os clientes dividem o mesmo limite de requisições.

## Documentação de projeto

As specs e os planos de implementação de cada funcionalidade ficam em `docs/superpowers/`.

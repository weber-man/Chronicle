# Chronicles

A private timeline for life events, memories and plans. Fullstack app with Vue 3, TypeScript, Tailwind CSS, Express and SQLite.

The UI is fully localized in English and German (via `vue-i18n`). A language switcher is available in the header and on the login/account pages; the choice is stored in `localStorage`. All server logs, API messages, code comments and this README are in English (system-level). Stored user data such as event titles and categories is never translated.

## Features

- Timeline with year, month and day precision, plus ongoing events
- Server-side search, category/type filters, sorting and pagination
- Trash with restore and permanent deletion
- Insights dashboard (categories, decades, active years, data coverage)
- JSON export and merge-only import
- Admin backup of the SQLite database as download
- AI assistant via OpenRouter: free text → validated draft, preview, editing, iterative revision and explicit approval
- Command palette (`Ctrl`/`Cmd` + `K`), toasts and keyboard navigation
- User accounts with roles, session revocation and password reset
- Localized UI in English and German

## Getting started

```bash
cp .env.example .env
# Set ADMIN_PASSWORD in .env (at least 12 characters, no known default)
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

The SQLite file lives at `data/lifeline.sqlite` by default. The server loads `.env` automatically on start. `ADMIN_PASSWORD` is required on the first start; there is no known default admin anymore. If an existing database still contains the old default admin, the server replaces it on start using `ADMIN_PASSWORD` and invalidates all old sessions. Without `ADMIN_PASSWORD` it refuses to start.

## Tests and build

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm test` runs the API tests including migrations, auth, search, trash, export/import, insights, AI drafts and an i18n key-parity check.

In production Express also serves the built frontend, so a single Node port behind a reverse proxy is enough.

## Database, migrations and backups

The schema is managed through versioned migrations (`PRAGMA user_version`). On start:

1. the current schema version is read,
2. before a real migration a consistent SQLite copy is created under `data/backups/`,
3. pending migrations run inside a transaction.

Migrations extend the schema and fill missing values. Existing users, events and password hashes are preserved. The last 20 migration backups are kept; older ones are removed automatically.

Administrators can additionally download a database backup via **Account → Data → Database backup** or `GET /api/admin/backup`.

> When upgrading an existing Docker volume, back it up first. The image runs as the unprivileged `node` user; an old volume may still be owned by `root`. In that case apply `chown -R 1000:1000` to the volume once.

### Import

Import is deliberately **merge-only**: existing data is never replaced. Events with the same title, start date and category are treated as duplicates and skipped. The result reports `imported`, `skipped` and `total`.

## AI assistant (OpenRouter)

Under **AI** each user can store their own OpenRouter API key and choose a model from the OpenRouter model list.

- The key is stored AES-256-GCM encrypted in the `ai_settings` table. The key for that is derived from `JWT_SECRET`. If `JWT_SECRET` changes, the OpenRouter key must be re-entered; the app points this out.
- The key is never returned to the browser in plain text, only as a masked hint (last four characters).
- The model list is cached server-side for 15 minutes and prefetched in the background after login. If OpenRouter fails, a fallback list is used for 60 seconds so the next request retries.
- Free text is sent to OpenRouter; the answer must be a JSON event and is validated server-side against the same schema as normal events.
- The draft is **not saved automatically**. You can edit it, have the AI revise it (every answer is validated again) or discard it.
- When generating and revising, your description and the names of your existing categories are sent to OpenRouter. Event contents are not sent automatically.
- OpenRouter calls are rate-limited per user and per IP.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, version and schema version |
| `GET` | `/api/health/ready` | Readiness including a database check |
| `GET` | `/api/events` | List with `search`, `category`, `type`, `sort`, `page`, `pageSize` |
| `POST` | `/api/events` | Create an event |
| `PUT` | `/api/events/:id` | Update an event |
| `DELETE` | `/api/events/:id` | Move to trash (`?permanent=true` for permanent deletion) |
| `GET` | `/api/events/trash` | Read the trash |
| `POST` | `/api/events/:id/restore` | Restore an event |
| `DELETE` | `/api/trash` | Empty the trash |
| `GET` | `/api/insights` | Statistics and distributions |
| `GET` | `/api/ai/settings` | Read AI connection (key masked only) |
| `PUT` | `/api/ai/settings` | Save OpenRouter key and/or model |
| `DELETE` | `/api/ai/settings` | Remove the OpenRouter key |
| `GET` | `/api/ai/models` | Load OpenRouter models (fallback list on network errors) |
| `POST` | `/api/ai/draft` | Create an event draft from free text |
| `POST` | `/api/ai/revise` | Revise an existing draft by instruction |
| `GET` | `/api/export` | JSON export (`?includeTrash=false` optional) |
| `POST` | `/api/import` | JSON import (merge-only) |
| `GET` | `/api/admin/backup` | Download a SQLite backup |

All event and data endpoints require a session. Write requests additionally require the CSRF token. Error responses carry an English `message` plus a stable `code`; the frontend maps known codes to the current UI language.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port, default `3001` |
| `DB_PATH` | Path to the SQLite file, default `data/lifeline.sqlite` |
| `JWT_SECRET` | Signing secret and base for OpenRouter key encryption. At least 48 bytes; placeholders such as `change-me` are rejected. Without a value a secret is generated and reused from `data/.jwt-secret` |
| `OPENROUTER_BASE_URL` | Optional; default `https://openrouter.ai/api/v1` |
| `OPENROUTER_DEFAULT_MODEL` | Optional; default model for new AI connections, default `openai/gpt-4o-mini` |
| `OPENROUTER_SITE_URL` | Optional; `HTTP-Referer` header value sent to OpenRouter, default `http://localhost:3001` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap administrator on first start. `ADMIN_PASSWORD` is always required for an empty database; known default values are rejected. |
| `ADMIN_NAME`, `ADMIN_COLOR` | Display name and color of the bootstrap administrator |
| `ALLOW_REGISTRATION` | Public registration is disabled by default; only `true` enables it |
| `CORS_ORIGINS` | Comma-separated allowed origins; without a value no cross-origin requests are allowed |
| `TRUST_PROXY` | Express `trust proxy` value, e.g. `1` or `loopback`. `true` trusts all hops and weakens IP rate limits; use with caution. |
| `LOG_REQUESTS` | `true` enables structured request logs |
| `APP_VERSION` | Optional version shown in `/api/health` |
| `NODE_ENV` | `production` enables secure cookies and `__Host-` cookie names |

## Security

- HTTP-only JWT session cookie; `__Host-` prefix in production
- signed CSRF token bound to user and session version, plus Origin validation
- password hashing via `scrypt` with `N=2^17`; legacy hashes are rehashed on successful login
- no default admin credentials; known legacy defaults are rotated on start or startup is refused
- role model with `admin` and `user`
- strict per-user data isolation
- rate limiting per IP and per account/email on login, registration, password reset and AI calls
- OpenRouter keys AES-256-GCM encrypted at rest, never in plain text in API responses
- password reset with short-lived token; tokens are never returned over the API and are invalidated on password changes
- session revocation via `session_version` after password/role changes and on logout
- CSP and other security headers
- error responses without internal details; logs contain no email addresses, event titles or reset tokens

Password-reset tokens are delivered through the optional server hook `onPasswordResetToken` to a mail or notification service. The HTTP response is identical whether or not an account exists.

## Docker / deployment

The image builds the frontend and backend together. The container runs as the `node` user and has a health check against `/api/health/ready`.

```bash
export JWT_SECRET="$(openssl rand -hex 48)"
export ADMIN_PASSWORD="$(openssl rand -base64 24)" # save this securely
docker build -f Dockerfile -t chronicles-backend .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$JWT_SECRET" \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -v chronicles_data:/app/data \
  chronicles-backend
```

Example with Docker Compose:

```yaml
services:
  chronicles:
    image: ghcr.io/weber-man/chronicle-backend:latest
    container_name: chronicles
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
      DB_PATH: /app/data/lifeline.sqlite
      JWT_SECRET: "${JWT_SECRET:?JWT_SECRET muss gesetzt sein}"
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: "${ADMIN_PASSWORD:?ADMIN_PASSWORD muss gesetzt sein}"
      ADMIN_NAME: Administrator
      ADMIN_COLOR: "#7c3aed"
      ALLOW_REGISTRATION: "false"
      CORS_ORIGINS: https://chronicles.example.com
      TRUST_PROXY: "1"
    volumes:
      - chronicles_data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/health/ready').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

volumes:
  chronicles_data:
```

### Reverse proxy

- Proxy to the Chronicles container port, e.g. `http://127.0.0.1:3001`.
- Set `TRUST_PROXY` appropriately so rate limiting sees the real client IP.
- If your proxy sets a Content-Security-Policy, it must not be `default-src 'none'` or the frontend assets will be blocked.
- A minimal working example:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:;
```

## CI

`.github/workflows/ci.yml` checks on pushes and pull requests:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

The Docker release workflow still builds the image for GitHub Container Registry on tags. GitHub Actions and the Docker base image are pinned to fixed commit/digest values; Dependabot checks npm, action and Docker updates weekly.

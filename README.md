# Lifeline

Moderne kleine Fullstack-App für Lebensereignisse und Zeitspannen.

## Stack

- Vue 3 + TypeScript + Vite
- Tailwind CSS
- Express + TypeScript
- SQLite (`better-sqlite3`)

## Start

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Build

```bash
npm run build
npm run start
```

Die SQLite-Datei liegt unter `data/lifeline.sqlite`.

In Production liefert der Express-Server auch das gebaute Frontend aus. Ein Reverse Proxy kann also einfach auf den einen Node-Port zeigen.

## Sicherheit / Auth

- HTTP-only JWT-Cookie für Sessions
- CSRF-Schutz für schreibende Requests
- Passwort-Hashing via `scrypt`
- Rollenmodell mit `admin` und `user`
- strikte Datentrennung pro Benutzer
- Rate Limiting auf Login/Registrierung/Passwort-Reset
- Passwort-Reset mit kurzlebigem Token

Wichtige Umgebungsvariablen für Production:

- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ALLOW_REGISTRATION=false` (wenn öffentliche Selbstregistrierung aus sein soll)

Für lokales Testen zeigt der Passwort-Reset-Request den Token im Response an. In Production ist das standardmäßig aus und sollte an einen Mail-Flow angebunden werden.

## Docker / Deployment

Das Image baut Frontend und Backend zusammen. Der Container liefert die App und `/api` über denselben Port aus.

```bash
docker build -f Dockerfile.backend -t lifeline-backend .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production \
  -e JWT_SECRET='change-me' \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_PASSWORD='change-me-too' \
  -v lifeline_data:/app/data \
  lifeline-backend
```

Beispiel mit Docker Compose:

```yaml
services:
  lifeline:
    image: ghcr.io/weber-man/chronicle-backend:latest
    container_name: lifeline
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
      JWT_SECRET: change-this-to-a-long-random-secret
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: change-this-admin-password
      ADMIN_NAME: Administrator
      ADMIN_COLOR: "#7c3aed"
      ALLOW_REGISTRATION: "false"
    volumes:
      - lifeline_data:/app/data

volumes:
  lifeline_data:
```

### Reverse Proxy

- Proxy auf den Lifeline-Container-Port, z. B. `http://127.0.0.1:3001`.
- Wenn dein Proxy eine Content-Security-Policy setzt, darf sie nicht `default-src 'none'` sein, sonst werden die Frontend-Assets blockiert.
- Minimal brauchbar ist z. B.:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:;
```

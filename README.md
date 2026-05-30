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

## Backend als Docker-Container

Nur das Backend ist containerisiert.

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

Ein Compose-Beispiel liegt in `docker-compose.backend.example.yml`.

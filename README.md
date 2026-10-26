# Chronicles

Private Zeitleiste für Lebensereignisse, Erinnerungen und Pläne. Fullstack-App mit Vue 3, TypeScript, Tailwind CSS, Express und SQLite.

## Funktionen

- Zeitleiste mit Jahres-, Monats- und Tagesgenauigkeit sowie laufenden Ereignissen
- serverseitige Suche, Kategorie-/Typ-Filter, Sortierung und Pagination
- Papierkorb mit Wiederherstellen und endgültigem Löschen
- Insights-Dashboard (Kategorien, Jahrzehnte, aktive Jahre, Datenabdeckung)
- JSON-Export und merge-only Import
- Admin-Backup der SQLite-Datenbank als Download
- KI-Assistent über OpenRouter: Freitext → validierter Entwurf, Vorschau, Bearbeitung, iterative Korrektur und explizite Freigabe
- Command Palette (`Strg`/`Cmd` + `K`), Toasts und Tastatur-Navigation
- Benutzerkonten mit Rollen, Session-Widerruf und Passwort-Reset

## Start

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

Die SQLite-Datei liegt standardmäßig unter `data/lifeline.sqlite`.

## Tests und Build

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm test` startet die API-Tests inklusive Migration, Auth, Suche, Papierkorb, Export/Import, Insights und KI-Entwürfen.

In Production liefert Express auch das gebaute Frontend aus. Ein Reverse Proxy kann daher auf den einen Node-Port zeigen.

## Datenbank, Migrationen und Backups

Das Schema wird über versionierte Migrationen (`PRAGMA user_version`) verwaltet. Beim Start:

1. wird die vorhandene Schema-Version gelesen,
2. vor einer echten Migration eine konsistente SQLite-Kopie unter `data/backups/` angelegt,
3. die ausstehenden Migrationen in einer Transaktion angewendet.

Migrationen erweitern das Schema und füllen fehlende Werte auf. Vorhandene Benutzer, Ereignisse und Passwort-Hashes bleiben erhalten. Die letzten 20 Migrationsbackups werden aufbewahrt; ältere werden automatisch entfernt.

Ein Datenbank-Backup lässt sich zusätzlich als Administrator über **Konto → Daten → Datenbank-Backup** herunterladen oder über `GET /api/admin/backup`.

> Beim Upgrade eines bestehenden Docker-Volumes zuerst ein Backup des Volumes erstellen. Das Image läuft als nicht privilegierter `node`-Benutzer; ein altes Volume kann noch `root` gehören. In diesem Fall einmalig `chown -R 1000:1000` auf das Volume anwenden.

### Import

Der Import ist bewusst **merge-only**: vorhandene Daten werden nie ersetzt. Ereignisse mit gleichem Titel, Startdatum und gleicher Kategorie gelten als Duplikat und werden übersprungen. Das Ergebnis meldet `imported`, `skipped` und `total`.

## KI-Assistent (OpenRouter)

Unter **KI** kann pro Benutzer ein eigener OpenRouter-API-Key hinterlegt und ein Modell aus der OpenRouter-Modellliste gewählt werden.

- Der Key wird mit AES-256-GCM verschlüsselt in der Tabelle `ai_settings` gespeichert. Der Schlüssel dafür wird aus `JWT_SECRET` abgeleitet. Wird `JWT_SECRET` geändert, muss der OpenRouter-Key neu hinterlegt werden; die App weist darauf hin.
- Der Key wird nie im Klartext an den Browser zurückgegeben, sondern nur als maskierter Hinweis (letzte vier Zeichen).
- Die Modellliste wird serverseitig 15 Minuten gecacht und nach der Anmeldung im Hintergrund vorgeladen. Schlägt OpenRouter fehl, wird die Fallback-Liste 60 Sekunden lang verwendet, damit die nächste Anfrage erneut versucht wird.
- Ein Freitext wird an OpenRouter gesendet; die Antwort muss ein JSON-Ereignis sein und wird serverseitig gegen dasselbe Schema wie normale Ereignisse geprüft.
- Der Entwurf wird **nicht automatisch gespeichert**. Du kannst ihn bearbeiten, von der KI überarbeiten lassen (jede Antwort wird erneut validiert) oder verwerfen.
- Beim Erzeugen und Überarbeiten werden die Beschreibung und die Namen deiner vorhandenen Kategorien an OpenRouter übertragen. Ereignisse werden nicht automatisch mitgesendet.
- OpenRouter-Aufrufe sind pro Benutzer rate-limitiert.

## API-Überblick

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, Version und Schema-Version |
| `GET` | `/api/health/ready` | Readiness inkl. Datenbank-Check |
| `GET` | `/api/events` | Liste mit `search`, `category`, `type`, `sort`, `page`, `pageSize` |
| `POST` | `/api/events` | Ereignis anlegen |
| `PUT` | `/api/events/:id` | Ereignis aktualisieren |
| `DELETE` | `/api/events/:id` | In den Papierkorb verschieben (`?permanent=true` für endgültig) |
| `GET` | `/api/events/trash` | Papierkorb lesen |
| `POST` | `/api/events/:id/restore` | Ereignis wiederherstellen |
| `DELETE` | `/api/trash` | Papierkorb leeren |
| `GET` | `/api/insights` | Statistiken und Verteilungen |
| `GET` | `/api/ai/settings` | KI-Verbindung lesen (Key nur maskiert) |
| `PUT` | `/api/ai/settings` | OpenRouter-Key und/oder Modell speichern |
| `DELETE` | `/api/ai/settings` | OpenRouter-Key entfernen |
| `GET` | `/api/ai/models` | OpenRouter-Modelle laden (Fallback-Liste bei Netzwerkfehler) |
| `POST` | `/api/ai/draft` | Ereignis-Entwurf aus Freitext erzeugen |
| `POST` | `/api/ai/revise` | Vorhandenen Entwurf per Anweisung überarbeiten |
| `GET` | `/api/export` | JSON-Export (`?includeTrash=false` optional) |
| `POST` | `/api/import` | JSON-Import (merge-only) |
| `GET` | `/api/admin/backup` | SQLite-Backup herunterladen |

Alle Ereignis- und Daten-Endpunkte benötigen eine Session. Schreibende Requests benötigen zusätzlich das CSRF-Token.

## Umgebungsvariablen

| Variable | Bedeutung |
| --- | --- |
| `PORT` | HTTP-Port, Standard `3001` |
| `DB_PATH` | Pfad zur SQLite-Datei, Standard `data/lifeline.sqlite` |
| `JWT_SECRET` | Signatur-Secret und Basis für die Verschlüsselung der OpenRouter-Keys. Ohne Wert wird ein Secret in `data/.jwt-secret` erzeugt und wiederverwendet |
| `OPENROUTER_BASE_URL` | Optional; Standard `https://openrouter.ai/api/v1` |
| `OPENROUTER_DEFAULT_MODEL` | Optional; Standardmodell für neue KI-Verbindungen, Standard `openai/gpt-4o-mini` |
| `OPENROUTER_SITE_URL` | Optional; Wert für den `HTTP-Referer`-Header an OpenRouter, Standard `http://localhost:3001` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap-Administrator beim ersten Start. In Production ist `ADMIN_PASSWORD` bei einer leeren Datenbank Pflicht; der bekannte Entwicklungs-Standard wird dort abgelehnt. |
| `ADMIN_NAME`, `ADMIN_COLOR` | Anzeigename und Farbe des Bootstrap-Administrators |
| `ALLOW_REGISTRATION` | `false` deaktiviert die öffentliche Registrierung |
| `CORS_ORIGINS` | Kommagetrennte erlaubte Origins; ohne Wert werden keine Cross-Origin-Requests erlaubt |
| `TRUST_PROXY` | Express-`trust proxy`-Wert, z. B. `1` oder `loopback` |
| `LOG_REQUESTS` | `true` aktiviert strukturierte Request-Logs |
| `PASSWORD_RESET_DEBUG` | `true` zeigt Reset-Tokens auch in Production (nur für Tests) |
| `APP_VERSION` | Optionale Versionsanzeige in `/api/health` |
| `NODE_ENV` | `production` aktiviert sichere Cookies und unterdrückt Debug-Ausgaben |

## Sicherheit

- HTTP-only JWT-Cookie für Sessions
- CSRF-Schutz für schreibende Requests
- Passwort-Hashing via `scrypt`
- Rollenmodell mit `admin` und `user`
- strikte Datentrennung pro Benutzer
- Rate Limiting auf Login, Registrierung, Passwort-Reset und KI-Aufrufe
- OpenRouter-Keys AES-256-GCM-verschlüsselt at rest, nie im Klartext im API-Response
- Passwort-Reset mit kurzlebigem Token
- Session-Widerruf über `session_version` nach Passwort-/Rollenänderung
- CSP und weitere Security-Header
- Fehlerantworten ohne interne Details

Für lokales Testen zeigt der Passwort-Reset-Request den Token im Response an. In Production ist das standardmäßig aus und sollte an einen Mail-Flow angebunden werden.

## Docker / Deployment

Das Image baut Frontend und Backend zusammen. Der Container läuft als `node`-Benutzer und besitzt einen Healthcheck gegen `/api/health/ready`.

```bash
docker build -f Dockerfile.backend -t chronicles-backend .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production \
  -e JWT_SECRET='change-me' \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_PASSWORD='change-me-too' \
  -v chronicles_data:/app/data \
  chronicles-backend
```

Beispiel mit Docker Compose:

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
      JWT_SECRET: change-this-to-a-long-random-secret
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: change-this-admin-password
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

### Reverse Proxy

- Proxy auf den Chronicles-Container-Port, z. B. `http://127.0.0.1:3001`.
- Bei einem Proxy `TRUST_PROXY` passend setzen, damit Rate-Limiting die echte Client-IP sieht.
- Wenn dein Proxy eine Content-Security-Policy setzt, darf sie nicht `default-src 'none'` sein, sonst werden die Frontend-Assets blockiert.
- Minimal brauchbar ist z. B.:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:;
```

## CI

`.github/workflows/ci.yml` prüft bei Pushes und Pull Requests:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

Der Docker-Release-Workflow baut bei Tags weiterhin das Image für GitHub Container Registry.

import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'lifeline.sqlite');

fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

app.use(cors());
app.use(express.json());

const timelineDateSchema = z.object({
  precision: z.enum(['year', 'month', 'day']),
  year: z.number().int().min(0).max(9999),
  month: z.number().int().min(1).max(12).nullable().optional(),
  day: z.number().int().min(1).max(31).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.precision !== 'year' && !value.month) {
    ctx.addIssue({ code: 'custom', path: ['month'], message: 'Monat fehlt.' });
  }
  if (value.precision === 'day' && !value.day) {
    ctx.addIssue({ code: 'custom', path: ['day'], message: 'Tag fehlt.' });
  }
});

const eventSchema = z.object({
  userId: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(40).default('Alltag'),
  startDate: timelineDateSchema,
  endDate: timelineDateSchema.nullable(),
  isOngoing: z.boolean().default(false),
});

const userSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    is_ongoing INTEGER NOT NULL DEFAULT 0,
    sort_start TEXT NOT NULL,
    sort_end TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

seed();

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/users', (_req, res) => {
  res.json(getUsers());
});

app.post('/api/users', (req, res) => {
  const payload = userSchema.parse(req.body);
  db.prepare('INSERT INTO users (name, color) VALUES (?, ?)').run(payload.name, payload.color);
  res.status(201).json(getUsers());
});

app.get('/api/events', (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const events = getEvents(userId);
  res.json({ events, summary: getSummary(events) });
});

app.post('/api/events', (req, res) => {
  const payload = eventSchema.parse(req.body);
  const normalized = normalizeEvent(payload);
  const result = db.prepare(`
    INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end)
    VALUES (@userId, @title, @description, @category, @startDate, @endDate, @isOngoing, @sortStart, @sortEnd)
  `).run(normalized);

  res.status(201).json(getEventById(Number(result.lastInsertRowid)));
});

app.put('/api/events/:id', (req, res) => {
  const payload = eventSchema.parse(req.body);
  const normalized = normalizeEvent(payload);
  db.prepare(`
    UPDATE events
    SET user_id = @userId,
        title = @title,
        description = @description,
        category = @category,
        start_date = @startDate,
        end_date = @endDate,
        is_ongoing = @isOngoing,
        sort_start = @sortStart,
        sort_end = @sortEnd,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...normalized, id: Number(req.params.id) });

  res.json(getEventById(Number(req.params.id)));
});

app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: error.issues[0]?.message ?? 'Ungültige Eingabe.' });
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: 'Unbekannter Serverfehler.' });
});

app.listen(port, () => {
  console.log(`Lifeline backend listening on http://localhost:${port}`);
});

type TimelineDate = z.infer<typeof timelineDateSchema>;
type EventInput = z.infer<typeof eventSchema>;

function normalizeEvent(payload: EventInput) {
  const startDate = cleanDate(payload.startDate);
  const endDate = payload.endDate ? cleanDate(payload.endDate) : null;

  if (endDate && sortKey(startDate, false) > sortKey(endDate, true)) {
    throw new Error('Das Ende darf nicht vor dem Anfang liegen.');
  }

  return {
    userId: payload.userId,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    startDate: JSON.stringify(startDate),
    endDate: endDate ? JSON.stringify(endDate) : null,
    isOngoing: payload.isOngoing ? 1 : 0,
    sortStart: sortKey(startDate, false),
    sortEnd: sortKey(endDate ?? startDate, true),
  };
}

function cleanDate(date: TimelineDate): TimelineDate {
  return {
    precision: date.precision,
    year: date.year,
    month: date.precision === 'year' ? null : date.month ?? null,
    day: date.precision === 'day' ? date.day ?? null : null,
  };
}

function sortKey(date: TimelineDate, end: boolean) {
  const month = date.precision === 'year' ? (end ? 12 : 1) : date.month ?? (end ? 12 : 1);
  const day = date.precision === 'day'
    ? date.day ?? (end ? daysInMonth(date.year, month) : 1)
    : end
      ? daysInMonth(date.year, month)
      : 1;
  return `${String(date.year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getUsers() {
  return db.prepare('SELECT id, name, color, created_at as createdAt FROM users ORDER BY created_at ASC, id ASC').all();
}

function getEvents(userId?: number | null) {
  const statement = userId
    ? db.prepare(`SELECT id, user_id as userId, title, description, category, start_date as startDate, end_date as endDate, is_ongoing as isOngoing, created_at as createdAt, updated_at as updatedAt, sort_start as sortStart, sort_end as sortEnd FROM events WHERE user_id = ? ORDER BY sort_start ASC, sort_end ASC, id ASC`)
    : db.prepare(`SELECT id, user_id as userId, title, description, category, start_date as startDate, end_date as endDate, is_ongoing as isOngoing, created_at as createdAt, updated_at as updatedAt, sort_start as sortStart, sort_end as sortEnd FROM events ORDER BY sort_start ASC, sort_end ASC, id ASC`);

  return (statement.all(...(userId ? [userId] : [])) as Record<string, unknown>[]).map(deserializeEvent);
}

function getEventById(id: number) {
  const row = db.prepare(`SELECT id, user_id as userId, title, description, category, start_date as startDate, end_date as endDate, is_ongoing as isOngoing, created_at as createdAt, updated_at as updatedAt, sort_start as sortStart, sort_end as sortEnd FROM events WHERE id = ?`).get(id) as Record<string, unknown>;
  return deserializeEvent(row);
}

function deserializeEvent(row: Record<string, unknown>) {
  return {
    ...row,
    startDate: JSON.parse(String(row.startDate)),
    endDate: row.endDate ? JSON.parse(String(row.endDate)) : null,
    isOngoing: Boolean(row.isOngoing),
  };
}

function getSummary(events: ReturnType<typeof getEvents>) {
  const users = getUsers();
  if (!events.length) {
    return {
      totalUsers: users.length,
      totalEvents: 0,
      rangeLabel: 'Noch leer',
      ongoingEvents: 0,
    };
  }

  const first = events[0];
  const last = events[events.length - 1];

  return {
    totalUsers: users.length,
    totalEvents: events.length,
    rangeLabel: `${first.startDate.year} – ${(last.endDate ?? last.startDate).year}`,
    ongoingEvents: events.filter((event: ReturnType<typeof getEvents>[number]) => event.isOngoing).length,
  };
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (count.count > 0) return;

  const insertUser = db.prepare('INSERT INTO users (name, color) VALUES (?, ?)');
  const insertEvent = db.prepare(`
    INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end)
    VALUES (@userId, @title, @description, @category, @startDate, @endDate, @isOngoing, @sortStart, @sortEnd)
  `);

  const userResult = insertUser.run('Manuel', '#38bdf8');
  const userId = Number(userResult.lastInsertRowid);
  const samples: EventInput[] = [
    {
      userId,
      title: 'Studium Informatik',
      description: 'Die Jahre, in denen das Fundament für spätere Projekte gelegt wurde.',
      category: 'Bildung',
      startDate: { precision: 'year', year: 2010 },
      endDate: { precision: 'year', year: 2015 },
      isOngoing: false,
    },
    {
      userId,
      title: 'Geburt erstes Kind',
      description: 'Ein Moment, der alles neu sortiert hat.',
      category: 'Familie',
      startDate: { precision: 'day', year: 2020, month: 4, day: 3 },
      endDate: null,
      isOngoing: false,
    },
    {
      userId,
      title: 'Urlaub in Norwegen',
      description: 'Nordlichter, Fjorde und einmal komplett durchatmen.',
      category: 'Reisen',
      startDate: { precision: 'month', year: 2025, month: 6 },
      endDate: { precision: 'month', year: 2025, month: 6 },
      isOngoing: false,
    },
  ];

  for (const sample of samples) {
    insertEvent.run(normalizeEvent(sample));
  }
}

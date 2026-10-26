import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createAiModelCache } from '../server/ai.js';
import { createApp } from '../server/app.js';
import { latestSchemaVersion } from '../server/migrations.js';

function makeFixture(extra: Parameters<typeof createApp>[0] = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-feature-'));
  const dbPath = path.join(dir, 'lifeline.sqlite');
  const fixture = createApp({
    dbPath,
    jwtSecret: 'test-secret',
    adminEmail: 'admin@example.com',
    adminPassword: 'AdminPassword123!',
    adminName: 'Admin',
    adminColor: '#7c3aed',
    allowRegistration: true,
    secureCookies: false,
    ...extra,
  });
  return {
    ...fixture,
    dir,
    dbPath,
    cleanup: () => {
      fixture.db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function register(agent: request.SuperAgentTest, payload?: Partial<{ name: string; color: string; email: string; password: string }>) {
  const response = await agent.post('/api/auth/register').send({
    name: 'Alice',
    color: '#38bdf8',
    email: 'alice@example.com',
    password: 'VerySecurePass123!',
    ...payload,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body as { user: { id: number; email: string }; csrfToken: string };
}

async function createEvent(
  agent: request.SuperAgentTest,
  csrfToken: string,
  payload: Partial<{
    title: string;
    description: string;
    category: string;
    startDate: { precision: 'year' | 'month' | 'day'; year: number; month?: number | null; day?: number | null };
    endDate: { precision: 'year' | 'month' | 'day'; year: number; month?: number | null; day?: number | null } | null;
    isOngoing: boolean;
  }> = {},
) {
  const response = await agent.post('/api/events').set('x-csrf-token', csrfToken).send({
    title: 'Norwegen',
    description: 'Roadtrip',
    category: 'Reisen, Familie',
    startDate: { precision: 'year', year: 2020 },
    endDate: { precision: 'year', year: 2022 },
    isOngoing: false,
    ...payload,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}

test('search, category and type filters plus pagination run on the server', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent);
    await createEvent(agent, auth.csrfToken, { title: 'Norwegen', category: 'Reisen, Familie' });
    await createEvent(agent, auth.csrfToken, {
      title: 'Umzug',
      description: 'Neue Wohnung',
      category: 'Alltag',
      startDate: { precision: 'day', year: 2019, month: 4, day: 2 },
      endDate: null,
    });
    await createEvent(agent, auth.csrfToken, {
      title: 'Studium',
      description: 'Bachelor',
      category: 'Bildung',
      startDate: { precision: 'year', year: 2014 },
      endDate: null,
      isOngoing: true,
    });

    const all = await agent.get('/api/events?pageSize=2&page=1');
    assert.equal(all.status, 200);
    assert.equal(all.body.events.length, 2);
    assert.equal(all.body.pagination.total, 3);
    assert.equal(all.body.pagination.totalPages, 2);
    assert.equal(all.body.summary.totalCategories, 4);
    assert.ok(all.body.facets.categories.some((entry: { name: string; count: number }) => entry.name === 'Familie' && entry.count === 1));

    const secondPage = await agent.get('/api/events?pageSize=2&page=2');
    assert.equal(secondPage.body.events.length, 1);

    const search = await agent.get('/api/events?search=norw');
    assert.equal(search.body.events.length, 1);
    assert.equal(search.body.events[0].title, 'Norwegen');

    const category = await agent.get('/api/events?category=Familie');
    assert.equal(category.body.events.length, 1);
    assert.equal(category.body.events[0].title, 'Norwegen');

    const partialCategory = await agent.get('/api/events?category=Fami');
    assert.equal(partialCategory.body.events.length, 0);

    const ranges = await agent.get('/api/events?type=ranges');
    assert.equal(ranges.body.events.length, 1);

    const ongoing = await agent.get('/api/events?type=ongoing');
    assert.equal(ongoing.body.events.length, 1);
    assert.equal(ongoing.body.events[0].title, 'Studium');

    const titleSort = await agent.get('/api/events?sort=title-asc');
    assert.deepEqual(titleSort.body.events.map((event: { title: string }) => event.title), ['Norwegen', 'Studium', 'Umzug']);
  } finally {
    fixture.cleanup();
  }
});

test('soft delete, trash, restore and permanent deletion preserve active data correctly', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent);
    const event = await createEvent(agent, auth.csrfToken);

    const trashed = await agent.delete(`/api/events/${event.id}`).set('x-csrf-token', auth.csrfToken);
    assert.equal(trashed.status, 200);
    assert.equal(trashed.body.mode, 'trash');

    const active = await agent.get('/api/events');
    assert.equal(active.body.events.length, 0);
    assert.equal(active.body.summary.trashEvents, 1);

    const trash = await agent.get('/api/events/trash');
    assert.equal(trash.status, 200);
    assert.equal(trash.body.events.length, 1);
    assert.ok(trash.body.events[0].deletedAt);

    const restored = await agent.post(`/api/events/${event.id}/restore`).set('x-csrf-token', auth.csrfToken);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.title, 'Norwegen');

    const afterRestore = await agent.get('/api/events');
    assert.equal(afterRestore.body.events.length, 1);

    await agent.delete(`/api/events/${event.id}`).set('x-csrf-token', auth.csrfToken);
    const purged = await agent.delete(`/api/events/${event.id}?permanent=true`).set('x-csrf-token', auth.csrfToken);
    assert.equal(purged.status, 200);
    assert.equal(purged.body.mode, 'permanent');

    const empty = await agent.get('/api/events/trash');
    assert.equal(empty.body.events.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test('export and import round-trip events and skip duplicates without losing existing data', async () => {
  const fixture = makeFixture();
  try {
    const alice = request.agent(fixture.app);
    const aliceAuth = await register(alice);
    await createEvent(alice, aliceAuth.csrfToken);
    const point = await createEvent(alice, aliceAuth.csrfToken, {
      title: 'Geburt',
      description: '',
      category: 'Meilenstein',
      startDate: { precision: 'day', year: 1990, month: 7, day: 14 },
      endDate: null,
    });
    await alice.delete(`/api/events/${point.id}`).set('x-csrf-token', aliceAuth.csrfToken);

    const exported = await alice.get('/api/export');
    assert.equal(exported.status, 200);
    assert.equal(exported.body.format, 'chronicle.export');
    assert.equal(exported.body.events.length, 2);
    assert.match(exported.headers['content-disposition'], /chronicle-export/);

    const duplicateImport = await alice.post('/api/import').set('x-csrf-token', aliceAuth.csrfToken).send(exported.body);
    assert.equal(duplicateImport.status, 200);
    assert.equal(duplicateImport.body.imported, 0);
    assert.equal(duplicateImport.body.skipped, 2);

    const bob = request.agent(fixture.app);
    const bobAuth = await register(bob, { name: 'Bob', email: 'bob@example.com', color: '#ef4444' });
    const imported = await bob.post('/api/import').set('x-csrf-token', bobAuth.csrfToken).send(exported.body);
    assert.equal(imported.status, 200);
    assert.equal(imported.body.imported, 2);

    const bobEvents = await bob.get('/api/events?pageSize=10');
    assert.equal(bobEvents.body.events.length, 1);
    assert.equal(bobEvents.body.events[0].title, 'Norwegen');
    assert.equal(bobEvents.body.events[0].category, 'Reisen, Familie');

    const bobTrash = await bob.get('/api/events/trash');
    assert.equal(bobTrash.body.events.length, 1);
    assert.equal(bobTrash.body.events[0].title, 'Geburt');

    const aliceStillThere = await alice.get('/api/events');
    assert.equal(aliceStillThere.body.events.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('insights summarize the archive without touching event data', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent);
    await createEvent(agent, auth.csrfToken, {
      title: 'Norwegen',
      description: '',
      category: 'Reisen, Familie',
      startDate: { precision: 'year', year: 2020 },
      endDate: { precision: 'year', year: 2022 },
    });
    await createEvent(agent, auth.csrfToken, {
      title: 'Studium',
      description: '',
      category: 'Bildung',
      startDate: { precision: 'year', year: 2020 },
      endDate: { precision: 'year', year: 2021 },
    });
    await createEvent(agent, auth.csrfToken, {
      title: 'Geburt',
      description: '',
      category: 'Meilenstein',
      startDate: { precision: 'day', year: 1990, month: 7, day: 14 },
      endDate: null,
    });

    const response = await agent.get('/api/insights');
    assert.equal(response.status, 200);
    assert.equal(response.body.totalEvents, 3);
    assert.equal(response.body.busiestYear.year, 2020);
    assert.equal(response.body.busiestYear.count, 2);
    assert.ok(response.body.categories.some((entry: { name: string; count: number }) => entry.name === 'Familie' && entry.count === 1));
    assert.equal(response.body.longestEvent.title, 'Norwegen');
    assert.equal(response.body.firstEvent.title, 'Geburt');
    assert.equal(response.body.lastEvent.title, 'Norwegen');
    assert.ok(response.body.perYear.some((entry: { year: number; count: number }) => entry.year === 2020 && entry.count === 2));

    const events = await agent.get('/api/events');
    assert.equal(events.body.events.length, 3);
  } finally {
    fixture.cleanup();
  }
});

test('AI model cache deduplicates requests and expires successful and fallback lists differently', async () => {
  let now = 0;
  let calls = 0;
  const cache = createAiModelCache({ ttlMs: 1_000, fallbackTtlMs: 50, now: () => now });
  const load = () => {
    calls += 1;
    return Promise.resolve({ models: [{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', contextLength: 128_000 }], source: 'openrouter' as const });
  };

  const [first, second] = await Promise.all([cache.load(load), cache.load(load)]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(cache.get(), first);

  now = 999;
  await cache.load(load);
  assert.equal(calls, 1, 'successful model lists should remain cached for the configured TTL');
  now = 1_001;
  await cache.load(load);
  assert.equal(calls, 2, 'expired model lists should be fetched again');

  const fallback = createAiModelCache({ ttlMs: 1_000, fallbackTtlMs: 50, now: () => now });
  const fallbackLoad = () => Promise.resolve({
    models: [{ id: 'fallback/model', name: 'Fallback', contextLength: null }],
    source: 'fallback' as const,
  });
  await fallback.load(fallbackLoad);
  now += 49;
  await fallback.load(fallbackLoad);
  assert.equal(fallback.get()?.source, 'fallback');
  now += 2;
  assert.equal(fallback.get(), null, 'fallback lists should expire sooner so the next request retries OpenRouter');
});

test('AI settings encrypt the OpenRouter key and draft/revision responses are validated and never auto-saved', async () => {
  const initialDraft = {
    title: 'Umzug nach Lissabon',
    description: 'Wir sind im Sommer 2023 nach Lissabon gezogen.',
    category: 'Reisen, Familie',
    startDate: { precision: 'month', year: 2023, month: 7, day: null },
    endDate: null,
    isOngoing: false,
  };
  const revisedDraft = {
    ...initialDraft,
    title: 'Umzug nach Lissabon im Juli',
    category: 'Reisen, Familie, Neuanfang',
  };
  let modelListRequests = 0;
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      modelListRequests += 1;
      return new Response(JSON.stringify({
        data: [
          { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o mini', context_length: 128000 },
          { id: 'image/only', name: 'Image only', architecture: { output_modalities: ['image'] } },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string }> };
      const userMessage = body.messages?.at(-1)?.content ?? '';
      const content = userMessage.includes('UNGUELTIG')
        ? '{"title":""}'
        : JSON.stringify(userMessage.includes('Der Benutzer möchte folgende Änderung:') ? revisedDraft : initialDraft);
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  };

  const fixture = makeFixture({
    openRouterBaseUrl: 'https://openrouter.test/api/v1',
    fetchImpl: mockFetch as typeof fetch,
  });
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent);
    const apiKey = 'sk-or-v1-test-secret-key-1234';

    const before = await agent.get('/api/ai/settings');
    assert.equal(before.status, 200);
    assert.equal(before.body.configured, false);

    const saved = await agent.put('/api/ai/settings').set('x-csrf-token', auth.csrfToken).send({
      apiKey,
      model: 'openai/gpt-4o-mini',
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.configured, true);
    assert.equal(saved.body.model, 'openai/gpt-4o-mini');
    assert.equal(saved.body.keyHint, '••••1234');
    assert.ok(!JSON.stringify(saved.body).includes(apiKey));

    const stored = fixture.db.prepare('SELECT api_key_encrypted as value FROM ai_settings WHERE user_id = ?').get(auth.user.id) as { value: string };
    assert.ok(stored.value.startsWith('v1.'));
    assert.notEqual(stored.value, apiKey);
    assert.ok(!stored.value.includes(apiKey));

    const models = await agent.get('/api/ai/models');
    assert.equal(models.status, 200);
    assert.equal(models.body.source, 'openrouter');
    assert.deepEqual(models.body.models.map((model: { id: string }) => model.id), ['openai/gpt-4o-mini']);
    assert.equal(modelListRequests, 1);

    const cachedModels = await agent.get('/api/ai/models');
    assert.equal(cachedModels.status, 200);
    assert.deepEqual(cachedModels.body, models.body);
    assert.equal(modelListRequests, 1, 'model list should be served from the server cache');

    const draftResponse = await agent.post('/api/ai/draft').set('x-csrf-token', auth.csrfToken).send({
      prompt: 'Sommer 2023 Umzug mit Lea nach Lissabon nach Alfama.',
    });
    assert.equal(draftResponse.status, 200, JSON.stringify(draftResponse.body));
    assert.equal(draftResponse.body.draft.title, initialDraft.title);
    assert.equal(draftResponse.body.draft.category, 'Reisen, Familie');
    assert.equal(draftResponse.body.model, 'openai/gpt-4o-mini');

    const untouched = await agent.get('/api/events');
    assert.equal(untouched.body.pagination.total, 0, 'AI drafts must not create events before confirmation');

    const revised = await agent.post('/api/ai/revise').set('x-csrf-token', auth.csrfToken).send({
      draft: draftResponse.body.draft,
      instruction: 'Ergänze Neuanfang und präzisiere den Titel.',
    });
    assert.equal(revised.status, 200, JSON.stringify(revised.body));
    assert.equal(revised.body.draft.title, revisedDraft.title);
    assert.equal(revised.body.draft.category, 'Reisen, Familie, Neuanfang');

    const confirmed = await agent.post('/api/events').set('x-csrf-token', auth.csrfToken).send(revised.body.draft);
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.body.title, revisedDraft.title);

    const invalid = await agent.post('/api/ai/draft').set('x-csrf-token', auth.csrfToken).send({
      prompt: 'UNGUELTIG',
    });
    assert.equal(invalid.status, 502);
    assert.match(invalid.body.message, /kein gültiger Entwurf/i);

    const eventsAfter = await agent.get('/api/events');
    assert.equal(eventsAfter.body.pagination.total, 1);

    const bob = request.agent(fixture.app);
    await register(bob, { name: 'Bob', email: 'bob@example.com', color: '#ef4444' });
    const bobSettings = await bob.get('/api/ai/settings');
    assert.equal(bobSettings.body.configured, false);

    const removed = await agent.delete('/api/ai/settings').set('x-csrf-token', auth.csrfToken);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.removed, 1);

    const afterRemoval = await agent.get('/api/ai/settings');
    assert.equal(afterRemoval.body.configured, false);
    const missingKey = await agent.post('/api/ai/draft').set('x-csrf-token', auth.csrfToken).send({ prompt: 'Neuer Versuch' });
    assert.equal(missingKey.status, 400);
    assert.match(missingKey.body.message, /API-Key/i);
  } finally {
    fixture.cleanup();
  }
});

test('changing a password revokes old sessions and reissues a working CSRF token', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent);
    const oldAuthCookie = await readAuthCookie(fixture.app, 'alice@example.com', 'VerySecurePass123!');

    const changed = await agent.patch('/api/account').set('x-csrf-token', auth.csrfToken).send({
      currentPassword: 'VerySecurePass123!',
      newPassword: 'EvenMoreSecure123!',
    });
    assert.equal(changed.status, 200);
    assert.equal(typeof changed.body.csrfToken, 'string');

    const oldSession = await request(fixture.app).get('/api/events').set('Cookie', oldAuthCookie);
    assert.equal(oldSession.status, 401);

    const withReissuedSession = await agent.get('/api/events');
    assert.equal(withReissuedSession.status, 200);

    const writeWithReissuedCsrf = await agent.post('/api/events').set('x-csrf-token', changed.body.csrfToken).send({
      title: 'Neue Sitzung',
      description: '',
      category: 'Test',
      startDate: { precision: 'year', year: 2026 },
      endDate: null,
      isOngoing: false,
    });
    assert.equal(writeWithReissuedCsrf.status, 201);
  } finally {
    fixture.cleanup();
  }
});

test('password reset revokes previously issued JWTs', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    await register(agent);
    const oldAuthCookie = await readAuthCookie(fixture.app, 'alice@example.com', 'VerySecurePass123!');

    const resetRequest = await request(fixture.app).post('/api/auth/password-reset/request').send({ email: 'alice@example.com' });
    assert.equal(typeof resetRequest.body.resetToken, 'string');

    const confirm = await request(fixture.app).post('/api/auth/password-reset/confirm').send({
      token: resetRequest.body.resetToken,
      password: 'BrandNewSecure123!',
    });
    assert.equal(confirm.status, 200);

    const oldSession = await request(fixture.app).get('/api/events').set('Cookie', oldAuthCookie);
    assert.equal(oldSession.status, 401);

    const newLogin = await request(fixture.app).post('/api/auth/login').send({
      email: 'alice@example.com',
      password: 'BrandNewSecure123!',
    });
    assert.equal(newLogin.status, 200);
  } finally {
    fixture.cleanup();
  }
});

test('CORS only reflects explicitly configured origins and unknown APIs return JSON', async () => {
  const fixture = makeFixture({ corsOrigins: ['https://allowed.example'] });
  try {
    const allowed = await request(fixture.app).get('/api/health').set('Origin', 'https://allowed.example');
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://allowed.example');

    const denied = await request(fixture.app).get('/api/health').set('Origin', 'https://evil.example');
    assert.equal(denied.headers['access-control-allow-origin'], undefined);

    const missing = await request(fixture.app).get('/api/does-not-exist');
    assert.equal(missing.status, 404);
    assert.match(missing.headers['content-type'], /application\/json/);
    assert.equal(missing.body.message, 'API-Endpunkt nicht gefunden.');

    const malformed = await request(fixture.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.message, 'Ungültiges JSON.');
  } finally {
    fixture.cleanup();
  }
});

test('production refuses to bootstrap an admin with the development default password', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-production-'));
  const dbPath = path.join(dir, 'lifeline.sqlite');
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () => createApp({ dbPath, jwtSecret: 'test-secret', secureCookies: false }),
      /ADMIN_PASSWORD/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy databases are migrated with a backup and reopen without changing data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-migration-'));
  const dbPath = path.join(dir, 'lifeline.sqlite');
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE events (
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
  const userId = Number(legacy.prepare('INSERT INTO users (name, color) VALUES (?, ?)').run('Legacy', '#123456').lastInsertRowid);
  legacy.prepare('INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'Altes Ereignis', 'bleibt erhalten', 'Alt', JSON.stringify({ precision: 'year', year: 2020, month: null, day: null }), null, 0, '2020-01-01', '2020-12-31');
  legacy.close();

  const first = createApp({
    dbPath,
    jwtSecret: 'test-secret',
    adminEmail: 'legacy@example.com',
    adminPassword: 'LegacyPassword123!',
    secureCookies: false,
  });
  try {
    assert.equal(first.schemaVersion, latestSchemaVersion);
    const backups = fs.readdirSync(path.join(dir, 'backups')).filter((entry) => entry.endsWith('.sqlite'));
    assert.equal(backups.length, 1);

    const columns = first.db.prepare('PRAGMA table_info(events)').all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === 'deleted_at'));
    const userColumns = first.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    assert.ok(userColumns.some((column) => column.name === 'session_version'));

    const agent = request.agent(first.app);
    const login = await agent.post('/api/auth/login').send({ email: 'legacy@example.com', password: 'LegacyPassword123!' });
    assert.equal(login.status, 200);
    const events = await agent.get('/api/events');
    assert.equal(events.body.events.length, 1);
    assert.equal(events.body.events[0].title, 'Altes Ereignis');
    assert.equal(events.body.events[0].description, 'bleibt erhalten');
  } finally {
    first.db.close();
  }

  const second = createApp({ dbPath, jwtSecret: 'test-secret', secureCookies: false });
  try {
    assert.equal(second.schemaVersion, latestSchemaVersion);
    const backups = fs.readdirSync(path.join(dir, 'backups')).filter((entry) => entry.endsWith('.sqlite'));
    assert.equal(backups.length, 1, 'reopening a current database must not create another backup');
    const count = second.db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    assert.equal(Number(count.count), 1);
  } finally {
    second.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function readAuthCookie(app: Parameters<typeof createApp>[0] extends never ? never : ReturnType<typeof createApp>['app'], email: string, password: string) {
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  const setCookie = login.headers['set-cookie'] as unknown as string[];
  const auth = setCookie.find((entry) => entry.startsWith('lifeline_auth='));
  assert.ok(auth);
  return auth.split(';')[0];
}

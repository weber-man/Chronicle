import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { createApp } from '../server/app.js';

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeline-test-'));
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
  });
  return {
    ...fixture,
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
  assert.equal(response.status, 201);
  return response.body as { user: { id: number }; csrfToken: string };
}

test('authentication is required for event APIs', async () => {
  const fixture = makeFixture();
  try {
    const response = await request(fixture.app).get('/api/events');
    assert.equal(response.status, 401);
  } finally {
    fixture.cleanup();
  }
});

test('registered users can only see and manage their own events', async () => {
  const fixture = makeFixture();
  try {
    const alice = request.agent(fixture.app);
    const bob = request.agent(fixture.app);

    const aliceAuth = await register(alice);
    const bobAuth = await register(bob, { name: 'Bob', email: 'bob@example.com', color: '#ef4444' });

    const createResponse = await alice
      .post('/api/events')
      .set('x-csrf-token', aliceAuth.csrfToken)
      .send({
        title: 'Privates Ereignis',
        description: 'Nur Alice darf das sehen.',
        category: 'Privat',
        startDate: { precision: 'day', year: 2025, month: 5, day: 1 },
        endDate: null,
        isOngoing: false,
      });

    assert.equal(createResponse.status, 201);
    const eventId = createResponse.body.id as number;

    const aliceEvents = await alice.get('/api/events');
    assert.equal(aliceEvents.status, 200);
    assert.equal(aliceEvents.body.events.length, 1);
    assert.equal(aliceEvents.body.events[0].title, 'Privates Ereignis');

    const bobEvents = await bob.get('/api/events');
    assert.equal(bobEvents.status, 200);
    assert.equal(bobEvents.body.events.length, 0);

    const forbiddenUpdate = await bob
      .put(`/api/events/${eventId}`)
      .set('x-csrf-token', bobAuth.csrfToken)
      .send({
        title: 'Hacken',
        description: '',
        category: 'Privat',
        startDate: { precision: 'year', year: 2025 },
        endDate: null,
        isOngoing: false,
      });
    assert.equal(forbiddenUpdate.status, 404);

    const update = await alice
      .put(`/api/events/${eventId}`)
      .set('x-csrf-token', aliceAuth.csrfToken)
      .send({
        title: 'Privates Ereignis aktualisiert',
        description: 'Immer noch privat.',
        category: 'Privat',
        startDate: { precision: 'year', year: 2025 },
        endDate: { precision: 'year', year: 2026 },
        isOngoing: true,
      });
    assert.equal(update.status, 200);

    const remove = await alice.delete(`/api/events/${eventId}`).set('x-csrf-token', aliceAuth.csrfToken).send({});
    assert.equal(remove.status, 200);
    const afterDelete = await alice.get('/api/events');
    assert.equal(afterDelete.body.events.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test('csrf protection blocks authenticated write requests without token', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    await register(agent);
    const response = await agent.post('/api/events').send({
      title: 'Ohne CSRF',
      description: '',
      category: 'Test',
      startDate: { precision: 'year', year: 2025 },
      endDate: null,
      isOngoing: false,
    });
    assert.equal(response.status, 403);
  } finally {
    fixture.cleanup();
  }
});

test('admin can manage users while non-admins cannot', async () => {
  const fixture = makeFixture();
  try {
    const admin = request.agent(fixture.app);
    const login = await admin.post('/api/auth/login').send({ email: 'admin@example.com', password: 'AdminPassword123!' });
    assert.equal(login.status, 200);
    const csrfToken = login.body.csrfToken as string;

    const list = await admin.get('/api/admin/users');
    assert.equal(list.status, 200);
    assert.equal(list.body.users.length, 1);

    const create = await admin.post('/api/admin/users').set('x-csrf-token', csrfToken).send({
      name: 'Carol',
      color: '#22c55e',
      email: 'carol@example.com',
      password: 'CarolPassword123!',
      role: 'user',
    });
    assert.equal(create.status, 201);

    const createdId = create.body.user.id as number;
    const promote = await admin.patch(`/api/admin/users/${createdId}`).set('x-csrf-token', csrfToken).send({ role: 'admin' });
    assert.equal(promote.status, 200);
    assert.equal(promote.body.user.role, 'admin');

    const alice = request.agent(fixture.app);
    const auth = await register(alice);
    const forbidden = await alice.get('/api/admin/users');
    assert.equal(forbidden.status, 403);

    const updateSelf = await alice.patch('/api/account').set('x-csrf-token', auth.csrfToken).send({
      name: 'Alice Neu',
      currentPassword: 'VerySecurePass123!',
      newPassword: 'EvenMoreSecure123!'
    });
    assert.equal(updateSelf.status, 200);

    const relogin = await request(fixture.app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'EvenMoreSecure123!' });
    assert.equal(relogin.status, 200);
  } finally {
    fixture.cleanup();
  }
});

test('legacy schema is migrated and existing user becomes bootstrap admin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeline-legacy-'));
  const dbPath = path.join(dir, 'lifeline.sqlite');
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
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
  const userId = Number(legacyDb.prepare('INSERT INTO users (name, color) VALUES (?, ?)').run('Legacy', '#123456').lastInsertRowid);
  legacyDb.prepare('INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'Altes Ereignis', '', 'Alt', JSON.stringify({ precision: 'year', year: 2020, month: null, day: null }), null, 0, '2020-01-01', '2020-12-31');
  legacyDb.close();

  const fixture = createApp({ dbPath, jwtSecret: 'test-secret', adminEmail: 'legacy@example.com', adminPassword: 'LegacyPassword123!', secureCookies: false });
  try {
    const agent = request.agent(fixture.app);
    const login = await agent.post('/api/auth/login').send({ email: 'legacy@example.com', password: 'LegacyPassword123!' });
    assert.equal(login.status, 200);
    const events = await agent.get('/api/events');
    assert.equal(events.status, 200);
    assert.equal(events.body.events.length, 1);
  } finally {
    fixture.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid date ranges are rejected with a validation-style error', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent, { email: 'range@example.com' });
    const response = await agent.post('/api/events').set('x-csrf-token', auth.csrfToken).send({
      title: 'Ungültig',
      description: '',
      category: 'Test',
      startDate: { precision: 'year', year: 2026 },
      endDate: { precision: 'year', year: 2025 },
      isOngoing: false,
    });
    assert.equal(response.status, 400);
  } finally {
    fixture.cleanup();
  }
});

test('password verification rejects malformed hashes and accepts valid ones', () => {
  const hashed = hashPassword('VerySecurePass123!');
  assert.equal(verifyPassword('VerySecurePass123!', hashed), true);
  assert.equal(verifyPassword('VerySecurePass123!', 'broken-hash-format'), false);
});

test('account deletion requires password and removes session access', async () => {
  const fixture = makeFixture();
  try {
    const agent = request.agent(fixture.app);
    const auth = await register(agent, { email: 'delete-me@example.com', name: 'Delete Me' });

    const reject = await agent.delete('/api/account').set('x-csrf-token', auth.csrfToken).send({ password: 'wrong-password' });
    assert.equal(reject.status, 400);

    const remove = await agent.delete('/api/account').set('x-csrf-token', auth.csrfToken).send({ password: 'VerySecurePass123!' });
    assert.equal(remove.status, 200);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 401);
  } finally {
    fixture.cleanup();
  }
});

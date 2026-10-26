import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApp } from '../server/app.js';

function fixture(environment: string, enabled: boolean, password: string | undefined = 'TestAdminPassword123!') {
  const previousEnvironment = process.env.NODE_ENV;
  const previousPassword = process.env.ADMIN_PASSWORD;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-dev-auth-'));
  process.env.NODE_ENV = environment;
  delete process.env.ADMIN_PASSWORD;
  try {
    const result = createApp({ dbPath: path.join(dir, 'test.sqlite'), jwtSecret: '0123456789abcdef'.repeat(4), adminEmail: 'dev@example.com', adminPassword: password, devAutoLogin: enabled, secureCookies: false });
    return { ...result, cleanup() { result.db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
}

test('local development signs in automatically and retains CSRF protection', async () => {
  const app = fixture('development', true, '');
  try {
    // A pre-existing database can use a different email from the new .env.
    app.db.prepare("UPDATE users SET email = 'existing@example.com'").run();
    const agent = request.agent(app.app);
    const me = await agent.get('/api/auth/me').set('Host', 'localhost:3001').set('Origin', 'http://localhost:5173');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'existing@example.com');
    assert.equal(me.body.user.role, 'admin');
    const cookies = me.headers['set-cookie'] as unknown as string[];
    const csrf = cookies.find(cookie => cookie.startsWith('lifeline_csrf='))!.split(';')[0].slice('lifeline_csrf='.length);
    const withoutCsrf = await agent.post('/api/events').send({});
    assert.equal(withoutCsrf.status, 403);
    const saved = await agent.post('/api/events').set('x-csrf-token', csrf).send({ title: 'Development entry', description: '', category: 'Test', startDate: { precision: 'year', year: 2026 }, endDate: null, isOngoing: false });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal((await agent.get('/api/auth/me')).status, 200);
  } finally { app.cleanup(); }
});

test('development auto-login rejects external hosts and origins', async () => {
  const app = fixture('development', true);
  try {
    for (const headers of [
      { Host: 'chronicle.example.com' },
      { Host: 'localhost:3001', Origin: 'https://external.example.com' },
      { Host: 'localhost:3001', 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const result = await request(app.app).get('/api/auth/me').set(headers);
      assert.equal(result.status, 401);
      assert.equal(result.headers['set-cookie'], undefined);
    }
  } finally { app.cleanup(); }
});

test('Vite proxy allows saving AI settings with the browser origin and CSRF token', async () => {
  const app = fixture('development', true);
  const backend = app.app.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const { createServer } = await import('vite');
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: path.resolve('vite.config.ts'),
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: {
        host: '127.0.0.1',
        port: 0,
        proxy: { '/api': { target: `http://127.0.0.1:${(backend.address() as AddressInfo).port}` } },
      },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
    const me = await fetch(`${origin}/api/auth/me`, { headers: { Origin: origin } });
    assert.equal(me.status, 200);
    const cookies = me.headers.getSetCookie().map(cookie => cookie.split(';')[0]);
    const csrf = cookies.find(cookie => cookie.startsWith('lifeline_csrf='))!.slice('lifeline_csrf='.length);
    const headers = { Origin: origin, Cookie: cookies.join('; '), 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const body = JSON.stringify({ apiKey: 'sk-or-v1-local-proxy-regression-test', model: 'test/model' });
    const saved = await fetch(`${origin}/api/ai/settings`, { method: 'PUT', headers, body });
    assert.equal(saved.status, 200, await saved.text());

    const foreign = await fetch(`${origin}/api/ai/settings`, { method: 'PUT', headers: { ...headers, Origin: 'https://external.example.com' }, body });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).code, 'csrf_origin');

    const missingToken = await fetch(`${origin}/api/ai/settings`, { method: 'PUT', headers: { ...headers, 'x-csrf-token': '' }, body });
    assert.equal(missingToken.status, 403);
    assert.equal((await missingToken.json()).code, 'csrf_missing');
  } finally {
    await vite?.close();
    await new Promise<void>(resolve => backend.close(() => resolve()));
    app.cleanup();
  }
});

for (const [environment, enabled] of [['production', true], ['test', true], ['development', false]] as const) {
  test(`auto-login stays disabled in ${environment} with dev flag ${enabled}`, async () => {
    const app = fixture(environment, enabled);
    try {
      const result = await request(app.app).get('/api/auth/me').set('Host', 'localhost:3001');
      assert.equal(result.status, 401);
      assert.equal(result.headers['set-cookie'], undefined);
    } finally { app.cleanup(); }
  });
}

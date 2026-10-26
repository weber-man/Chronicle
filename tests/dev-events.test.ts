import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app';
import { importEvents, normalizeEvent } from '../server/events';
import { eventInputSchema } from '../server/schemas';
import { setLocale } from '../src/i18n';
import { createRandomEvents } from '../src/lib/dev-events';

test('development batches contain ten valid, varied events in either language', () => {
  for (const locale of ['de', 'en'] as const) {
    setLocale(locale);
    const events = createRandomEvents();
    assert.equal(events.length, 10);
    assert.equal(new Set(events.map(event => event.title)).size, 10);
    assert.ok(events.some(event => event.endDate === null));
    assert.ok(events.some(event => event.endDate && !event.isOngoing));
    assert.ok(events.some(event => event.isOngoing));
    for (const event of events) {
      assert.ok(event.category.includes(locale === 'de' ? 'Testdaten' : 'Test data'));
      assert.doesNotThrow(() => normalizeEvent({ ...eventInputSchema.parse(event), userId: 1 }));
    }
  }
});

test('repeated clicks add ten new entries even when random choices repeat', () => {
  const random = Math.random;
  let batches: ReturnType<typeof createRandomEvents>[];
  try {
    Math.random = () => 0;
    batches = [createRandomEvents(), createRandomEvents()];
  } finally {
    Math.random = random;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-demo-'));
  const { db } = createApp({
    dbPath: path.join(directory, 'test.sqlite'),
    jwtSecret: '0123456789abcdef'.repeat(4),
    adminEmail: 'test@example.com',
    adminPassword: 'TestPassword123!',
  });
  try {
    const { id } = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number };
    for (const events of batches) {
      assert.deepEqual(importEvents(db, id, events.map(event => eventInputSchema.parse(event))), { imported: 10, skipped: 0, total: 10 });
    }
    assert.equal((db.prepare('SELECT count(*) AS count FROM events').get() as { count: number }).count, 20);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

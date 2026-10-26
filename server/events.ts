import type Database from 'better-sqlite3';
import { HttpError } from './errors.js';
import type { EventInput, EventQuery } from './schemas.js';
import type { TimelineDate } from './types.js';

const EVENT_COLUMNS = `
  id,
  user_id as userId,
  title,
  description,
  category,
  start_date as startDate,
  end_date as endDate,
  is_ongoing as isOngoing,
  deleted_at as deletedAt,
  created_at as createdAt,
  updated_at as updatedAt,
  sort_start as sortStart,
  sort_end as sortEnd
`;

type EventRow = {
  id: number;
  userId: number;
  title: string;
  description: string;
  category: string;
  startDate: string;
  endDate: string | null;
  isOngoing: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sortStart: string;
  sortEnd: string;
};

export type StoredEvent = Omit<EventRow, 'startDate' | 'endDate' | 'isOngoing'> & {
  startDate: TimelineDate;
  endDate: TimelineDate | null;
  isOngoing: boolean;
};

export type ImportEvent = EventInput & {
  deletedAt?: string | null;
  createdAt?: string;
  sourceId?: number;
};

export function listEvents(db: Database.Database, userId: number, query: EventQuery) {
  const { where, params } = buildWhere(userId, query);
  const orderBy = sortClause(query.sort);
  const limit = query.pageSize;
  const offset = (query.page - 1) * limit;

  const total = Number((db.prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(params) as { count: number }).count);
  const rows = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM events
    ${where}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as EventRow[];

  return {
    events: rows.map(deserializeEvent),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export function getEventById(db: Database.Database, id: number, userId: number) {
  const row = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM events
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(id, userId) as EventRow | undefined;
  if (!row) throw new HttpError(404, 'Ereignis nicht gefunden.');
  return deserializeEvent(row);
}

export function createEvent(db: Database.Database, userId: number, payload: EventInput) {
  const normalized = normalizeEvent({ ...payload, userId });
  const result = db.prepare(`
    INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end)
    VALUES (@userId, @title, @description, @category, @startDate, @endDate, @isOngoing, @sortStart, @sortEnd)
  `).run(normalized);
  return getEventById(db, Number(result.lastInsertRowid), userId);
}

export function updateEvent(db: Database.Database, id: number, userId: number, payload: EventInput) {
  ensureEventOwner(db, id, userId, false);
  const normalized = normalizeEvent({ ...payload, userId });
  db.prepare(`
    UPDATE events
    SET title = @title,
        description = @description,
        category = @category,
        start_date = @startDate,
        end_date = @endDate,
        is_ongoing = @isOngoing,
        sort_start = @sortStart,
        sort_end = @sortEnd,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id AND user_id = @userId AND deleted_at IS NULL
  `).run({ ...normalized, id });
  return getEventById(db, id, userId);
}

export function softDeleteEvent(db: Database.Database, id: number, userId: number) {
  ensureEventOwner(db, id, userId, false);
  db.prepare(`
    UPDATE events
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).run(id, userId);
  const row = db.prepare('SELECT deleted_at as deletedAt FROM events WHERE id = ? AND user_id = ?').get(id, userId) as
    | { deletedAt: string | null }
    | undefined;
  return { deletedAt: row?.deletedAt ?? null };
}

export function restoreEvent(db: Database.Database, id: number, userId: number) {
  ensureEventOwner(db, id, userId, true);
  db.prepare(`
    UPDATE events
    SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
  `).run(id, userId);
  return getEventById(db, id, userId);
}

export function purgeEvent(db: Database.Database, id: number, userId: number) {
  ensureEventOwner(db, id, userId, true);
  db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(id, userId);
}

export function emptyTrash(db: Database.Database, userId: number) {
  const result = db.prepare('DELETE FROM events WHERE user_id = ? AND deleted_at IS NOT NULL').run(userId);
  return Number(result.changes);
}

export function getSummary(db: Database.Database, userId: number, totalUsers: number) {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(is_ongoing), 0) as ongoing,
      MIN(sort_start) as firstStart,
      MAX(sort_end) as lastEnd
    FROM events
    WHERE user_id = ? AND deleted_at IS NULL
  `).get(userId) as { total: number; ongoing: number; firstStart: string | null; lastEnd: string | null };

  const categories = readCategoryCounts(db, userId);
  const trash = db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND deleted_at IS NOT NULL').get(userId) as { count: number };

  return {
    totalUsers,
    totalEvents: Number(row.total),
    rangeLabel: row.firstStart && row.lastEnd
      ? `${String(row.firstStart).slice(0, 4)} – ${String(row.lastEnd).slice(0, 4)}`
      : 'Noch leer',
    ongoingEvents: Number(row.ongoing),
    totalCategories: categories.length,
    trashEvents: Number(trash.count),
  };
}

export function getFacets(db: Database.Database, userId: number) {
  return {
    categories: readCategoryCounts(db, userId).map(([name, count]) => ({ name, count })),
  };
}

export function getInsights(db: Database.Database, userId: number) {
  const rows = db.prepare(`
    SELECT id, title, start_date as startDate, end_date as endDate, is_ongoing as isOngoing,
           category, sort_start as sortStart, sort_end as sortEnd
    FROM events
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY sort_start ASC, sort_end ASC, id ASC
  `).all(userId) as Array<{
    id: number;
    title: string;
    startDate: string;
    endDate: string | null;
    isOngoing: number;
    category: string;
    sortStart: string;
    sortEnd: string;
  }>;

  const trash = db.prepare('SELECT COUNT(*) as count FROM events WHERE user_id = ? AND deleted_at IS NOT NULL').get(userId) as { count: number };
  if (!rows.length) {
    return {
      totalEvents: 0,
      ongoingEvents: 0,
      trashEvents: Number(trash.count),
      rangeLabel: 'Noch leer',
      fromYear: null,
      toYear: null,
      coverageYears: 0,
      coveredDays: 0,
      averageDurationDays: 0,
      firstEvent: null,
      lastEvent: null,
      longestEvent: null,
      busiestYear: null,
      perYear: [] as Array<{ year: number; count: number }>,
      categories: [] as Array<{ name: string; count: number }>,
    };
  }

  const first = rows[0];
  const last = [...rows].sort((left, right) => right.sortEnd.localeCompare(left.sortEnd))[0];
  const fromYear = Number(first.sortStart.slice(0, 4));
  const toYear = Number(last.sortEnd.slice(0, 4));
  const categoryCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  let coveredDays = 0;
  let longest: { id: number; title: string; days: number } | null = null;

  for (const row of rows) {
    const startYear = Number(row.sortStart.slice(0, 4));
    yearCounts.set(startYear, (yearCounts.get(startYear) ?? 0) + 1);

    for (const category of splitCategories(row.category)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }

    const days = Math.max(1, dayNumber(row.sortEnd) - dayNumber(row.sortStart) + 1);
    coveredDays += days;
    if (!longest || days > longest.days) {
      longest = { id: row.id, title: row.title, days };
    }
  }

  const perYear: Array<{ year: number; count: number }> = [];
  if (toYear - fromYear <= 120) {
    for (let year = fromYear; year <= toYear; year += 1) {
      perYear.push({ year, count: yearCounts.get(year) ?? 0 });
    }
  } else {
    for (const year of [...yearCounts.keys()].sort((left, right) => left - right)) {
      perYear.push({ year, count: yearCounts.get(year) ?? 0 });
    }
  }

  const busiestYear = perYear.reduce<{ year: number; count: number } | null>((best, entry) => {
    if (!best || entry.count > best.count) return entry;
    return best;
  }, null);

  return {
    totalEvents: rows.length,
    ongoingEvents: rows.filter((row) => Boolean(row.isOngoing)).length,
    trashEvents: Number(trash.count),
    rangeLabel: `${fromYear} – ${toYear}`,
    fromYear,
    toYear,
    coverageYears: toYear - fromYear + 1,
    coveredDays,
    averageDurationDays: Math.round(coveredDays / rows.length),
    firstEvent: compactEvent(first, 'start'),
    lastEvent: compactEvent(last, 'end'),
    // Kept explicit so future metadata can be added without breaking clients.
    longestEvent: longest,
    busiestYear,
    perYear,
    categories: [...categoryCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'de')),
  };
}

export function exportUserData(db: Database.Database, userId: number, includeTrash: boolean) {
  const rows = db.prepare(`
    SELECT ${EVENT_COLUMNS}
    FROM events
    WHERE user_id = ? ${includeTrash ? '' : 'AND deleted_at IS NULL'}
    ORDER BY sort_start ASC, sort_end ASC, id ASC
  `).all(userId) as EventRow[];

  return {
    format: 'chronicle.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    events: rows.map((row) => {
      const event = deserializeEvent(row);
      return {
        sourceId: event.id,
        title: event.title,
        description: event.description,
        category: event.category,
        startDate: event.startDate,
        endDate: event.endDate,
        isOngoing: event.isOngoing,
        deletedAt: event.deletedAt,
        createdAt: event.createdAt,
      };
    }),
  };
}

export function importEvents(db: Database.Database, userId: number, incoming: ImportEvent[]) {
  const existing = db.prepare(`
    SELECT title, sort_start as sortStart, sort_end as sortEnd, category
    FROM events
    WHERE user_id = ?
  `).all(userId) as Array<{ title: string; sortStart: string; sortEnd: string; category: string }>;

  const signatures = new Set(existing.map((row) => signature(row.title, row.sortStart, row.sortEnd, row.category)));
  const insert = db.prepare(`
    INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end, created_at, deleted_at)
    VALUES (@userId, @title, @description, @category, @startDate, @endDate, @isOngoing, @sortStart, @sortEnd, COALESCE(@createdAt, CURRENT_TIMESTAMP), @deletedAt)
  `);

  let imported = 0;
  let skipped = 0;
  const run = db.transaction(() => {
    for (const payload of incoming) {
      const normalized = normalizeEvent({ ...payload, userId });
      const key = signature(normalized.title, normalized.sortStart, normalized.sortEnd, normalized.category);
      if (signatures.has(key)) {
        skipped += 1;
        continue;
      }
      insert.run({
        ...normalized,
        createdAt: sanitizeTimestamp(payload.createdAt),
        deletedAt: sanitizeTimestamp(payload.deletedAt),
      });
      signatures.add(key);
      imported += 1;
    }
  });
  run();

  return { imported, skipped, total: incoming.length };
}

export function normalizeEvent(payload: EventInput & { userId: number }) {
  const startDate = cleanDate(payload.startDate);
  const endDate = payload.endDate ? cleanDate(payload.endDate) : null;
  validateDate(startDate);
  if (endDate) validateDate(endDate);

  if (endDate && sortKey(startDate, false) > sortKey(endDate, true)) {
    throw new HttpError(400, 'Das Ende darf nicht vor dem Anfang liegen.');
  }

  return {
    userId: payload.userId,
    title: payload.title,
    description: payload.description,
    category: normalizeCategories(payload.category),
    startDate: JSON.stringify(startDate),
    endDate: endDate ? JSON.stringify(endDate) : null,
    isOngoing: payload.isOngoing ? 1 : 0,
    sortStart: sortKey(startDate, false),
    sortEnd: sortKey(endDate ?? startDate, true),
  };
}

export function normalizeCategories(value: string) {
  const seen = new Set<string>();
  const unique = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry) return false;
      const key = entry.toLocaleLowerCase('de');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return unique.join(', ') || 'Alltag';
}

function buildWhere(userId: number, query: EventQuery) {
  const clauses = ['user_id = @userId'];
  const params: Record<string, unknown> = { userId };

  clauses.push(query.trash ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');

  if (query.search) {
    params.search = `%${escapeLike(query.search.toLocaleLowerCase('de'))}%`;
    clauses.push(`(
      lower(title) LIKE @search ESCAPE '\\'
      OR lower(description) LIKE @search ESCAPE '\\'
      OR lower(category) LIKE @search ESCAPE '\\'
    )`);
  }

  if (query.category) {
    const category = escapeLike(query.category.toLocaleLowerCase('de'));
    params.category = category;
    params.categoryPrefix = `${category}, %`;
    params.categorySuffix = `%, ${category}`;
    params.categoryMiddle = `%, ${category}, %`;
    clauses.push(`(
      lower(category) = @category
      OR lower(category) LIKE @categoryPrefix ESCAPE '\\'
      OR lower(category) LIKE @categorySuffix ESCAPE '\\'
      OR lower(category) LIKE @categoryMiddle ESCAPE '\\'
    )`);
  }

  if (query.type === 'points') clauses.push('end_date IS NULL AND is_ongoing = 0');
  if (query.type === 'ranges') clauses.push('end_date IS NOT NULL');
  if (query.type === 'ongoing') clauses.push('is_ongoing = 1');

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

function sortClause(sort: EventQuery['sort']) {
  switch (sort) {
    case 'start-desc':
      return 'sort_start DESC, sort_end DESC, id DESC';
    case 'duration-desc':
      return '(julianday(sort_end) - julianday(sort_start)) DESC, sort_start ASC, id ASC';
    case 'title-asc':
      return 'title COLLATE NOCASE ASC, sort_start ASC, id ASC';
    case 'updated-desc':
      return 'updated_at DESC, id DESC';
    case 'deleted-desc':
      return 'deleted_at DESC, id DESC';
    case 'start-asc':
    default:
      return 'sort_start ASC, sort_end ASC, id ASC';
  }
}

function deserializeEvent(row: EventRow): StoredEvent {
  return {
    ...row,
    startDate: parseDate(row.startDate, row.sortStart, false),
    endDate: row.endDate ? parseDate(row.endDate, row.sortEnd, true) : null,
    isOngoing: Boolean(row.isOngoing),
  };
}

function parseDate(value: string, fallbackSort: string, end: boolean): TimelineDate {
  try {
    const parsed = JSON.parse(value) as TimelineDate;
    if (parsed && typeof parsed.year === 'number' && ['year', 'month', 'day'].includes(parsed.precision)) {
      return parsed;
    }
  } catch {
    // Fall through to a lossless-enough display value instead of hiding the row.
  }
  const year = Number(fallbackSort?.slice(0, 4));
  return { precision: 'year', year: Number.isFinite(year) ? year : 0, month: null, day: null };
}

function readCategoryCounts(db: Database.Database, userId: number) {
  const rows = db.prepare('SELECT category FROM events WHERE user_id = ? AND deleted_at IS NULL').all(userId) as Array<{ category: string }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const category of splitCategories(row.category)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'de'));
}

function splitCategories(value: string) {
  return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
}

function cleanDate(date: TimelineDate): TimelineDate {
  return {
    precision: date.precision,
    year: date.year,
    month: date.precision === 'year' ? null : date.month ?? null,
    day: date.precision === 'day' ? date.day ?? null : null,
  };
}

function validateDate(date: TimelineDate) {
  if (date.precision === 'year') return;
  if (!date.month) throw new HttpError(400, 'Monat fehlt.');
  if (date.precision === 'day') {
    if (!date.day) throw new HttpError(400, 'Tag fehlt.');
    if (date.day > daysInMonth(date.year, date.month)) {
      throw new HttpError(400, 'Dieses Datum existiert nicht.');
    }
  }
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

function dayNumber(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
}

function compactEvent(
  row: { id: number; title: string; startDate: string; endDate: string | null; sortStart: string; sortEnd: string },
  boundary: 'start' | 'end',
) {
  return {
    id: row.id,
    title: row.title,
    date: boundary === 'start'
      ? parseDate(row.startDate, row.sortStart, false)
      : parseDate(row.endDate ?? row.startDate, row.sortEnd, true),
  };
}

function ensureEventOwner(db: Database.Database, eventId: number, userId: number, includeDeleted: boolean) {
  const row = db.prepare(`
    SELECT id FROM events
    WHERE id = ? AND user_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
  `).get(eventId, userId);
  if (!row) throw new HttpError(404, 'Ereignis nicht gefunden.');
}

function signature(title: string, sortStart: string, sortEnd: string, category: string) {
  return [title.trim().toLocaleLowerCase('de'), sortStart, sortEnd, category.toLocaleLowerCase('de')].join('|');
}

function sanitizeTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/.test(trimmed) ? trimmed : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

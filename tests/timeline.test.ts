import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, eventEnd, overlapsWindow, positionEvent, timelineDomain, timelineTicks, yearBoundary, yearDensity } from '../src/lib/timeline';
import type { LifeEvent } from '../src/lib/types';

function event(patch: Partial<LifeEvent> = {}): LifeEvent {
  return { id: 1, userId: 1, title: 'A memory', description: '', category: 'Travel', startDate: { precision: 'day', year: 2000, month: 1, day: 1 }, endDate: null, isOngoing: false, createdAt: '', updatedAt: '', sortStart: '', sortEnd: '', ...patch };
}
const window = { min: yearBoundary(2010), max: yearBoundary(2015) };

test('ongoing events extend to today rather than their stored end date', () => {
  const ongoing = event({ endDate: { precision: 'year', year: 2001 }, isOngoing: true });
  const today = yearBoundary(2026);
  assert.equal(eventEnd(ongoing, today), today);
  assert.ok(overlapsWindow(ongoing, window, today));
  assert.equal(timelineDomain([ongoing], today).max, yearBoundary(2027));
});

test('time spans crossing both window edges fill the plot without shifting dates', () => {
  const crossing = event({ endDate: { precision: 'year', year: 2020 } });
  assert.deepEqual(positionEvent(crossing, window), { left: 0, right: 100, width: 100, isInstant: false, clippedStart: true, clippedEnd: true });
  assert.ok(overlapsWindow(crossing, window));
  assert.equal(overlapsWindow(event(), window), false);
  assert.equal(overlapsWindow(event({ startDate: { precision: 'year', year: 2020 } }), window), false);
});

test('instant events remain exactly aligned with the axis', () => {
  const instant = event({ startDate: { precision: 'day', year: 2010, month: 1, day: 1 } });
  const positioned = positionEvent(instant, window);
  assert.equal(positioned.left, 0);
  assert.equal(positioned.width, 0);
  assert.equal(positioned.isInstant, true);
  assert.equal(overlapsWindow(event({ startDate: { precision: 'day', year: 2015, month: 1, day: 1 } }), window), false);
});

test('year labels remain bounded and spaced over decades or millennia', () => {
  for (const years of [[1990, 2027], [0, 10000]]) {
    for (const width of [180, 400, 760, 1200]) {
      const domain = { min: yearBoundary(years[0]), max: yearBoundary(years[1]) };
      const ticks = timelineTicks(domain, width, 'de');
      assert.ok(ticks.length <= Math.max(2, Math.floor(width / 85)) + 1);
      for (let index = 1; index < ticks.length; index++) {
        const pixels = (ticks[index].value - ticks[index - 1].value) / (domain.max - domain.min) * width;
        assert.ok(pixels >= 50, `${years.join('–')}: labels only ${pixels}px apart`);
      }
    }
  }
});

test('single-year zoom shows localized month ticks', () => {
  const domain = { min: yearBoundary(2024), max: yearBoundary(2025) };
  assert.ok(timelineTicks(domain, 760, 'de').some(tick => tick.label.includes('Mär')));
  assert.ok(timelineTicks(domain, 760, 'en').some(tick => tick.label.includes('Mar')));
  assert.ok(timelineTicks(domain, 760, 'de').every(tick => tick.value >= domain.min && tick.value < domain.max));
});

test('the overview counts all 100 events and caps the number of bins', () => {
  const events = Array.from({ length: 100 }, (_, index) => event({ id: index, startDate: { precision: 'year', year: 1990 + index % 35 } }));
  const bins = yearDensity(events, timelineDomain(events));
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 100);
  assert.ok(yearDensity(events, { min: yearBoundary(0), max: yearBoundary(10000) }).length <= 60);
});

test('year boundaries preserve years below 100 and leap years', () => {
  assert.equal(new Date(yearBoundary(42) * DAY_MS).getUTCFullYear(), 42);
  assert.equal(yearBoundary(2025) - yearBoundary(2024), 366);
});

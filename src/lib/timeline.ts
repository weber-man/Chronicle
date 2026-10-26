import { numericValue } from './date';
import type { LifeEvent } from './types';

export type TimelineWindow = { min: number; max: number };
export const DAY_MS = 86_400_000;
export function yearBoundary(year: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / DAY_MS;
}
export function todayValue(now = new Date()) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}
export function eventEnd(event: LifeEvent, today = todayValue()) {
  const start = numericValue(event.startDate, 'start');
  return event.isOngoing ? Math.max(start, today) : numericValue(event.endDate ?? event.startDate, 'end');
}
export function timelineDomain(events: LifeEvent[], today = todayValue()): TimelineWindow {
  if (!events.length) {
    const year = new Date(today * DAY_MS).getUTCFullYear();
    return { min: yearBoundary(year), max: yearBoundary(year + 1) };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const event of events) {
    min = Math.min(min, numericValue(event.startDate, 'start'));
    max = Math.max(max, eventEnd(event, today));
  }
  return {
    min: yearBoundary(new Date(min * DAY_MS).getUTCFullYear()),
    max: yearBoundary(new Date(max * DAY_MS).getUTCFullYear() + 1),
  };
}
export function overlapsWindow(event: LifeEvent, window: TimelineWindow, today = todayValue()) {
  return numericValue(event.startDate, 'start') < window.max && eventEnd(event, today) >= window.min;
}
export function positionEvent(event: LifeEvent, window: TimelineWindow, today = todayValue()) {
  const start = numericValue(event.startDate, 'start');
  const end = eventEnd(event, today);
  const position = (day: number) => Math.max(0, Math.min(100, (day - window.min) / Math.max(1, window.max - window.min) * 100));
  const isInstant = !event.endDate && !event.isOngoing;
  const left = position(start);
  const right = isInstant ? left : position(end);
  return { left, right, width: right - left, isInstant, clippedStart: start < window.min, clippedEnd: end >= window.max };
}
export function timelineTicks(window: TimelineWindow, width: number, locale: string) {
  const startYear = new Date(window.min * DAY_MS).getUTCFullYear();
  const endYear = new Date((window.max - 1) * DAY_MS).getUTCFullYear();
  const capacity = Math.max(2, Math.floor(width / 85));
  if (startYear === endYear) {
    const step = Math.ceil(12 / capacity);
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    return Array.from({ length: Math.ceil(12 / step) }, (_, index) => {
      const date = new Date(window.min * DAY_MS);
      date.setUTCMonth(index * step, 1);
      return { value: date.getTime() / DAY_MS, label: formatter.format(date) };
    });
  }
  const rawStep = Math.ceil((endYear - startYear + 1) / capacity);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, rawStep)));
  const step = [1, 2, 5, 10].map(value => value * magnitude).find(value => value >= rawStep)!;
  const years = [startYear];
  for (let year = Math.ceil((startYear + 1) / step) * step; year <= endYear; year += step) {
    // Keep labels at least one tick interval apart, including at the left edge.
    if (year - years[years.length - 1] >= step) years.push(year);
  }
  return years.map(year => ({ value: yearBoundary(year), label: String(year) }));
}
export function yearDensity(events: LifeEvent[], window: TimelineWindow) {
  const first = new Date(window.min * DAY_MS).getUTCFullYear();
  const last = new Date((window.max - 1) * DAY_MS).getUTCFullYear();
  const step = Math.max(1, Math.ceil((last - first + 1) / 60));
  const bins = Array.from({ length: Math.ceil((last - first + 1) / step) }, (_, index) => ({ year: first + index * step, endYear: Math.min(last, first + (index + 1) * step - 1), count: 0 }));
  for (const event of events) {
    const index = Math.floor((event.startDate.year - first) / step);
    if (bins[index]) bins[index].count++;
  }
  return bins;
}

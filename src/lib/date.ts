import type { LifeEvent, TimelineDate } from './types';

const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long' });

export function formatTimelineDate(value: TimelineDate): string {
  if (value.precision === 'year') return `${value.year}`;
  if (value.precision === 'month') {
    const monthDate = new Date(Date.UTC(value.year, (value.month ?? 1) - 1, 1));
    return `${monthFormatter.format(monthDate)} ${value.year}`;
  }

  const day = String(value.day ?? 1).padStart(2, '0');
  const month = String(value.month ?? 1).padStart(2, '0');
  return `${day}.${month}.${value.year}`;
}

export function formatEventRange(event: LifeEvent): string {
  const start = formatTimelineDate(event.startDate);
  if (!event.endDate) return start;
  const end = event.isOngoing ? 'heute' : formatTimelineDate(event.endDate);
  return `${start} – ${end}`;
}

export function eventDurationLabel(event: LifeEvent): string {
  const start = numericValue(event.startDate, 'start');
  const end = numericValue(event.endDate ?? event.startDate, 'end');
  const diffDays = Math.max(0, Math.round(end - start));

  if (diffDays < 31) return `${diffDays + 1} Tage`;
  if (diffDays < 366) return `${Math.max(1, Math.round((diffDays + 1) / 30))} Monate`;
  return `${Math.max(1, Math.round((diffDays + 1) / 365))} Jahre`;
}

export function numericValue(date: TimelineDate, boundary: 'start' | 'end' = 'start'): number {
  const isEnd = boundary === 'end';
  const month = date.precision === 'year' ? (isEnd ? 12 : 1) : date.month ?? (isEnd ? 12 : 1);
  const day = date.precision === 'day'
    ? date.day ?? (isEnd ? daysInMonth(date.year, month) : 1)
    : isEnd
      ? daysInMonth(date.year, month)
      : 1;

  return Date.UTC(date.year, month - 1, day) / 86400000;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function timelineBounds(events: LifeEvent[]) {
  if (!events.length) {
    const currentYear = new Date().getFullYear();
    return { min: Date.UTC(currentYear - 1, 0, 1) / 86400000, max: Date.UTC(currentYear + 1, 0, 1) / 86400000 };
  }

  const values = events.flatMap((event) => [
    numericValue(event.startDate, 'start'),
    numericValue(event.endDate ?? event.startDate, 'end'),
  ]);

  return {
    min: Math.min(...values) - 30,
    max: Math.max(...values) + 30,
  };
}

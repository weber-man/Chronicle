export type Precision = 'year' | 'month' | 'day';
export type UserRole = 'admin' | 'user';

export interface TimelineDate {
  precision: Precision;
  year: number;
  month?: number | null;
  day?: number | null;
}

export interface User {
  id: number;
  name: string;
  color: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthConfig {
  allowRegistration: boolean;
}

export interface LifeEvent {
  id: number;
  userId: number;
  title: string;
  description: string;
  category: string;
  startDate: TimelineDate;
  endDate: TimelineDate | null;
  isOngoing: boolean;
  createdAt: string;
  updatedAt: string;
  sortStart: string;
  sortEnd: string;
}

export interface Summary {
  totalUsers: number;
  totalEvents: number;
  rangeLabel: string;
  ongoingEvents: number;
}

function uniqueCategories(entries: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('de');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export function splitCategories(category: string) {
  return uniqueCategories(category.split(','));
}

export function joinCategories(categories: string[]) {
  const normalized = uniqueCategories(categories);
  return normalized.join(', ') || 'Alltag';
}

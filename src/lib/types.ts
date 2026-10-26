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
  version?: string;
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
  deletedAt?: string | null;
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
  totalCategories: number;
  trashEvents: number;
}

export type EventSort =
  | 'start-asc'
  | 'start-desc'
  | 'duration-desc'
  | 'title-asc'
  | 'updated-desc'
  | 'deleted-desc';

export type EventTypeFilter = 'all' | 'points' | 'ranges' | 'ongoing';

export interface EventQuery {
  search?: string;
  category?: string;
  type?: EventTypeFilter;
  sort?: EventSort;
  page?: number;
  pageSize?: number;
  trash?: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CategoryFacet {
  name: string;
  count: number;
}

export interface EventFacets {
  categories: CategoryFacet[];
}

export interface EventListResponse {
  events: LifeEvent[];
  summary: Summary;
  facets: EventFacets;
  pagination: Pagination;
}

export interface InsightsEvent {
  id: number;
  title: string;
  date: TimelineDate;
}

export interface Insights {
  totalEvents: number;
  ongoingEvents: number;
  trashEvents: number;
  rangeLabel: string;
  fromYear: number | null;
  toYear: number | null;
  coverageYears: number;
  coveredDays: number;
  averageDurationDays: number;
  firstEvent: InsightsEvent | null;
  lastEvent: InsightsEvent | null;
  longestEvent: { id: number; title: string; days: number } | null;
  busiestYear: { year: number; count: number } | null;
  perYear: Array<{ year: number; count: number }>;
  categories: CategoryFacet[];
}

export interface AiSettings {
  configured: boolean;
  model: string;
  keyHint: string | null;
  needsReentry: boolean;
}

export interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface AiModelsResponse {
  models: AiModel[];
  source: 'openrouter' | 'fallback';
}

export interface AiDraftInput {
  title: string;
  description: string;
  category: string;
  startDate: TimelineDate;
  endDate: TimelineDate | null;
  isOngoing: boolean;
}

export interface AiDraftResult {
  draft: AiDraftInput;
  model: string;
}

export interface ExportPayload {
  format: string;
  version: number;
  exportedAt: string;
  events: Array<Record<string, unknown>>;
}

export interface ImportResult {
  ok: true;
  imported: number;
  skipped: number;
  total: number;
}

export interface EmptyTrashResult {
  ok: true;
  removed: number;
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

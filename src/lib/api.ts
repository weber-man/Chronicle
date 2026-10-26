import type {
  AiDraftInput,
  AiDraftResult,
  AiModelsResponse,
  AiSettings,
  AuthConfig,
  EmptyTrashResult,
  EventListResponse,
  EventQuery,
  ImportResult,
  Insights,
  LifeEvent,
  Summary,
  User,
} from './types';

let csrfToken = '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
    public issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setCsrfToken(value: string) {
  csrfToken = value;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const cookies = document.cookie.split(';').map((entry) => entry.trim());
  const match = cookies.find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD'].includes(method)) {
    const token = csrfToken || readCookie('lifeline_csrf');
    if (token) {
      csrfToken = token;
      headers.set('x-csrf-token', token);
    }
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      method,
      credentials: 'include',
      headers,
    });
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar. Bitte Verbindung prüfen.');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload as { message?: string; requestId?: string; issues?: Array<{ path: string; message: string }> } | null;
    throw new ApiError(
      response.status,
      error?.message || `Anfrage fehlgeschlagen (${response.status}).`,
      error?.requestId,
      error?.issues,
    );
  }

  return payload as T;
}

function toQueryString(query: EventQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function downloadBlob(path: string, fallbackName: string) {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar. Bitte Verbindung prüfen.');
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `Download fehlgeschlagen (${response.status}).`;
    try {
      const payload = JSON.parse(text) as { message?: string };
      message = payload.message || message;
    } catch {
      // Keep fallback.
    }
    throw new ApiError(response.status, message);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export const api = {
  authConfig: () => request<AuthConfig>('/auth/config'),
  me: () => request<{ user: User }>('/auth/me'),
  login: (payload: { email: string; password: string }) => request<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload: { name: string; color: string; email: string; password: string }) => request<{ user: User; csrfToken: string }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  requestPasswordReset: (payload: { email: string }) => request<{ ok: true; message: string; resetToken?: string; expiresAt?: string }>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify(payload) }),
  confirmPasswordReset: (payload: { token: string; password: string }) => request<{ ok: true; message: string }>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  getEvents: (query: EventQuery = {}) => request<EventListResponse>(`/events${toQueryString(query)}`),
  getTrash: (query: EventQuery = {}) => request<EventListResponse>(`/events/trash${toQueryString({ ...query, trash: undefined })}`),
  getEvent: (id: number) => request<LifeEvent>(`/events/${id}`),
  createEvent: (payload: Record<string, unknown>) => request<LifeEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id: number, payload: Record<string, unknown>) => request<LifeEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id: number) => request<{ ok: true; mode: 'trash'; deletedAt: string | null }>(`/events/${id}`, { method: 'DELETE' }),
  purgeEvent: (id: number) => request<{ ok: true; mode: 'permanent' }>(`/events/${id}?permanent=true`, { method: 'DELETE' }),
  restoreEvent: (id: number) => request<LifeEvent>(`/events/${id}/restore`, { method: 'POST' }),
  emptyTrash: () => request<EmptyTrashResult>('/trash', { method: 'DELETE' }),
  getInsights: () => request<Insights>('/insights'),
  getAiSettings: () => request<AiSettings>('/ai/settings'),
  saveAiSettings: (payload: { apiKey?: string; model?: string }) => request<AiSettings>('/ai/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAiSettings: () => request<{ ok: true; removed: number }>('/ai/settings', { method: 'DELETE' }),
  getAiModels: () => request<AiModelsResponse>('/ai/models'),
  generateAiDraft: (prompt: string) => request<AiDraftResult>('/ai/draft', { method: 'POST', body: JSON.stringify({ prompt }) }),
  reviseAiDraft: (draft: AiDraftInput, instruction: string) => request<AiDraftResult>('/ai/revise', {
    method: 'POST',
    body: JSON.stringify({ draft, instruction }),
  }),
  exportData: () => downloadBlob('/export', `chronicle-export-${new Date().toISOString().slice(0, 10)}.json`),
  importData: (payload: unknown) => request<ImportResult>('/import', { method: 'POST', body: JSON.stringify(payload) }),
  downloadBackup: () => downloadBlob('/admin/backup', `chronicle-backup-${new Date().toISOString().slice(0, 10)}.sqlite`),
  updateAccount: (payload: Record<string, unknown>) => request<{ user: User; csrfToken?: string }>('/account', { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAccount: (password: string) => request<{ ok: true }>('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
  getAdminUsers: () => request<{ users: User[] }>('/admin/users'),
  createAdminUser: (payload: { name: string; color: string; email: string; password: string; role: 'admin' | 'user' }) => request<{ user: User }>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdminUser: (id: number, payload: Record<string, unknown>) => request<{ user: User; csrfToken?: string }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
};

export type { Summary };

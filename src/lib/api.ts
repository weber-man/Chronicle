import type { LifeEvent, Summary, User } from './types';

let csrfToken = '';

export function setCsrfToken(value: string) {
  csrfToken = value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (csrfToken && init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    headers.set('x-csrf-token', csrfToken);
  }

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers,
    ...init,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || 'API request failed');
  }

  return payload as T;
}

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  login: (payload: { email: string; password: string }) => request<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload: { name: string; color: string; email: string; password: string }) => request<{ user: User; csrfToken: string }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  getEvents: () => request<{ events: LifeEvent[]; summary: Summary }>('/events'),
  createEvent: (payload: Record<string, unknown>) => request<LifeEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id: number, payload: Record<string, unknown>) => request<LifeEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id: number) => request<{ ok: true }>(`/events/${id}`, { method: 'DELETE' }),
  updateAccount: (payload: Record<string, unknown>) => request<{ user: User }>('/account', { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAccount: (password: string) => request<{ ok: true }>('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
  getAdminUsers: () => request<{ users: User[] }>('/admin/users'),
  createAdminUser: (payload: { name: string; color: string; email: string; password: string; role: 'admin' | 'user' }) => request<{ user: User }>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdminUser: (id: number, payload: Record<string, unknown>) => request<{ user: User }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
};

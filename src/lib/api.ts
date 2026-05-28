import type { LifeEvent, Summary, User } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'API request failed');
  }

  return response.json() as Promise<T>;
}

export const api = {
  getUsers: () => request<User[]>('/users'),
  createUser: (payload: { name: string; color: string }) => request<User[]>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  getEvents: (userId?: number | null) => request<{ events: LifeEvent[]; summary: Summary }>(`/events${userId ? `?userId=${userId}` : ''}`),
  createEvent: (payload: Record<string, unknown>) => request<LifeEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (id: number, payload: Record<string, unknown>) => request<LifeEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id: number) => request<{ ok: true }>(`/events/${id}`, { method: 'DELETE' }),
};

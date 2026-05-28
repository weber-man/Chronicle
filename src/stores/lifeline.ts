import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../lib/api';
import type { LifeEvent, Summary, User } from '../lib/types';

export const useLifelineStore = defineStore('lifeline', () => {
  const users = ref<User[]>([]);
  const events = ref<LifeEvent[]>([]);
  const selectedUserId = ref<number | null>(null);
  const summary = ref<Summary>({ totalUsers: 0, totalEvents: 0, rangeLabel: 'Noch leer', ongoingEvents: 0 });
  const isLoading = ref(false);

  const selectedUser = computed(() => users.value.find((user) => user.id === selectedUserId.value) ?? null);

  async function loadUsers() {
    users.value = await api.getUsers();
    if (!selectedUserId.value && users.value[0]) selectedUserId.value = users.value[0].id;
  }

  async function loadEvents() {
    isLoading.value = true;
    try {
      const data = await api.getEvents(selectedUserId.value);
      events.value = data.events;
      summary.value = data.summary;
    } finally {
      isLoading.value = false;
    }
  }

  async function bootstrap() {
    await loadUsers();
    await loadEvents();
  }

  async function selectUser(userId: number | null) {
    selectedUserId.value = userId;
    await loadEvents();
  }

  async function addUser(payload: { name: string; color: string }) {
    users.value = await api.createUser(payload);
    selectedUserId.value = users.value.at(-1)?.id ?? selectedUserId.value;
    await loadEvents();
  }

  async function saveEvent(payload: Record<string, unknown>, id?: number) {
    if (id) await api.updateEvent(id, payload);
    else await api.createEvent(payload);
    await loadEvents();
  }

  async function removeEvent(id: number) {
    await api.deleteEvent(id);
    await loadEvents();
  }

  return {
    users,
    events,
    summary,
    selectedUserId,
    selectedUser,
    isLoading,
    bootstrap,
    selectUser,
    addUser,
    saveEvent,
    removeEvent,
  };
});

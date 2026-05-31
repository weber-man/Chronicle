import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setCsrfToken } from '../lib/api';
import type { LifeEvent, Summary, User } from '../lib/types';

export const useLifelineStore = defineStore('lifeline', () => {
  const me = ref<User | null>(null);
  const adminUsers = ref<User[]>([]);
  const events = ref<LifeEvent[]>([]);
  const summary = ref<Summary>({ totalUsers: 0, totalEvents: 0, rangeLabel: 'Noch leer', ongoingEvents: 0 });
  const isLoading = ref(false);
  const authReady = ref(false);
  const allowRegistration = ref(true);

  const isAuthenticated = computed(() => Boolean(me.value));
  const isAdmin = computed(() => me.value?.role === 'admin');
  const users = computed(() => (me.value ? [me.value] : []));
  const selectedUserId = computed(() => me.value?.id ?? null);

  async function bootstrap() {
    try {
      try {
        const config = await api.authConfig();
        allowRegistration.value = config.allowRegistration;
      } catch {
        allowRegistration.value = true;
      }

      const data = await api.me();
      me.value = data.user;
      await Promise.all([loadEvents(), loadAdminUsers()]);
    } catch {
      me.value = null;
      events.value = [];
      adminUsers.value = [];
      summary.value = { totalUsers: 0, totalEvents: 0, rangeLabel: 'Noch leer', ongoingEvents: 0 };
    } finally {
      authReady.value = true;
    }
  }

  async function login(payload: { email: string; password: string }) {
    const data = await api.login(payload);
    setCsrfToken(data.csrfToken);
    me.value = data.user;
    await Promise.all([loadEvents(), loadAdminUsers()]);
  }

  async function register(payload: { name: string; color: string; email: string; password: string }) {
    const data = await api.register(payload);
    setCsrfToken(data.csrfToken);
    me.value = data.user;
    await Promise.all([loadEvents(), loadAdminUsers()]);
  }

  async function requestPasswordReset(payload: { email: string }) {
    return api.requestPasswordReset(payload);
  }

  async function confirmPasswordReset(payload: { token: string; password: string }) {
    return api.confirmPasswordReset(payload);
  }

  async function logout() {
    await api.logout();
    setCsrfToken('');
    me.value = null;
    events.value = [];
    adminUsers.value = [];
    summary.value = { totalUsers: 0, totalEvents: 0, rangeLabel: 'Noch leer', ongoingEvents: 0 };
  }

  async function loadEvents() {
    if (!me.value) return;
    isLoading.value = true;
    try {
      const data = await api.getEvents();
      events.value = data.events;
      summary.value = data.summary;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadAdminUsers() {
    if (!isAdmin.value) {
      adminUsers.value = [];
      return;
    }
    const data = await api.getAdminUsers();
    adminUsers.value = data.users;
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

  async function updateAccount(payload: Record<string, unknown>) {
    const data = await api.updateAccount(payload);
    me.value = data.user;
    await loadAdminUsers();
  }

  async function deleteAccount(password: string) {
    await api.deleteAccount(password);
    await logout();
  }

  async function createUser(payload: { name: string; color: string; email: string; password: string; role: 'admin' | 'user' }) {
    await api.createAdminUser(payload);
    await loadAdminUsers();
  }

  async function updateUser(id: number, payload: Record<string, unknown>) {
    const data = await api.updateAdminUser(id, payload);
    adminUsers.value = adminUsers.value.map((user) => (user.id === id ? data.user : user));
    if (me.value?.id === id) me.value = data.user;
  }

  return {
    me,
    users,
    adminUsers,
    events,
    summary,
    isLoading,
    authReady,
    allowRegistration,
    isAuthenticated,
    isAdmin,
    selectedUserId,
    bootstrap,
    login,
    register,
    requestPasswordReset,
    confirmPasswordReset,
    logout,
    loadEvents,
    loadAdminUsers,
    saveEvent,
    removeEvent,
    updateAccount,
    deleteAccount,
    createUser,
    updateUser,
  };
});

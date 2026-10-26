import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiError, setCsrfToken } from '../lib/api';
import type {
  EventFacets,
  EventListResponse,
  EventQuery,
  Insights,
  LifeEvent,
  Pagination,
  Summary,
  User,
} from '../lib/types';
import { splitCategories } from '../lib/types';
import { useAiStore } from './ai';
import { useToastStore } from './toast';

const emptySummary = (): Summary => ({
  totalUsers: 0,
  totalEvents: 0,
  rangeLabel: 'Noch leer',
  ongoingEvents: 0,
  totalCategories: 0,
  trashEvents: 0,
});

const emptyPagination = (): Pagination => ({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

export const useLifelineStore = defineStore('lifeline', () => {
  const toast = useToastStore();
  const me = ref<User | null>(null);
  const adminUsers = ref<User[]>([]);
  const events = ref<LifeEvent[]>([]);
  const summary = ref<Summary>(emptySummary());
  const facets = ref<EventFacets>({ categories: [] });
  const pagination = ref<Pagination>(emptyPagination());
  const query = ref<EventQuery>({ page: 1, pageSize: 10, sort: 'start-asc', type: 'all' });
  const trash = ref<LifeEvent[]>([]);
  const trashQuery = ref<EventQuery>({ page: 1, pageSize: 20, sort: 'deleted-desc', type: 'all' });
  const trashPagination = ref<Pagination>(emptyPagination());
  const trashLoaded = ref(false);
  const insights = ref<Insights | null>(null);
  const isLoading = ref(false);
  const isLoadingTrash = ref(false);
  const isLoadingInsights = ref(false);
  const isSaving = ref(false);
  const authReady = ref(false);
  const allowRegistration = ref(true);
  const appVersion = ref('');
  const viewMode = ref<'page' | 'all'>('page');
  let bootstrapPromise: Promise<void> | null = null;
  let eventsRequest = 0;
  let trashRequest = 0;

  const isAuthenticated = computed(() => Boolean(me.value));
  const isAdmin = computed(() => me.value?.role === 'admin');
  const users = computed(() => (me.value ? [me.value] : []));
  const selectedUserId = computed(() => me.value?.id ?? null);
  const categories = computed(() => [...facets.value.categories].sort((left, right) => left.name.localeCompare(right.name, 'de')));
  const trashCount = computed(() => summary.value.trashEvents);
  const hasFilters = computed(() => Boolean(
    query.value.search
    || (query.value.category && query.value.category !== 'all')
    || (query.value.type && query.value.type !== 'all'),
  ));

  function reset() {
    useAiStore().reset();
    me.value = null;
    adminUsers.value = [];
    events.value = [];
    summary.value = emptySummary();
    facets.value = { categories: [] };
    pagination.value = emptyPagination();
    query.value = { page: 1, pageSize: 10, sort: 'start-asc', type: 'all' };
    trash.value = [];
    trashPagination.value = emptyPagination();
    trashLoaded.value = false;
    insights.value = null;
    viewMode.value = 'page';
  }

  async function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      try {
        try {
          const config = await api.authConfig();
          allowRegistration.value = config.allowRegistration;
          appVersion.value = config.version ?? '';
        } catch {
          allowRegistration.value = true;
        }

        const data = await api.me();
        me.value = data.user;
        await Promise.all([loadEvents(query.value), loadAdminUsers()]);
      } catch (error) {
        if (!(error instanceof ApiError && (error.status === 401 || error.status === 0))) {
          toast.error(error instanceof Error ? error.message : 'App konnte nicht geladen werden.');
        }
        reset();
      } finally {
        authReady.value = true;
      }
    })();
    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  }

  async function login(payload: { email: string; password: string }) {
    const data = await api.login(payload);
    useAiStore().reset();
    setCsrfToken(data.csrfToken);
    me.value = data.user;
    viewMode.value = 'page';
    query.value = { page: 1, pageSize: 10, sort: 'start-asc', type: 'all' };
    await Promise.all([loadEvents(), loadAdminUsers()]);
  }

  async function register(payload: { name: string; color: string; email: string; password: string }) {
    const data = await api.register(payload);
    useAiStore().reset();
    setCsrfToken(data.csrfToken);
    me.value = data.user;
    viewMode.value = 'page';
    query.value = { page: 1, pageSize: 10, sort: 'start-asc', type: 'all' };
    await Promise.all([loadEvents(), loadAdminUsers()]);
  }

  async function requestPasswordReset(payload: { email: string }) {
    return api.requestPasswordReset(payload);
  }

  async function confirmPasswordReset(payload: { token: string; password: string }) {
    return api.confirmPasswordReset(payload);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Clearing the local session is more important than the round-trip.
    }
    setCsrfToken('');
    reset();
  }

  async function loadEvents(next: Partial<EventQuery> = {}) {
    if (!me.value) return;
    const merged = { ...query.value, ...next };
    query.value = merged;
    viewMode.value = 'page';
    const requestId = ++eventsRequest;
    isLoading.value = true;
    try {
      const data = await api.getEvents(merged);
      if (requestId !== eventsRequest) return;
      applyListResponse(data);
    } finally {
      if (requestId === eventsRequest) isLoading.value = false;
    }
  }

  async function loadAllEvents(base: Partial<EventQuery> = {}) {
    if (!me.value) return;
    viewMode.value = 'all';
    const requestId = ++eventsRequest;
    isLoading.value = true;
    try {
      const collected: LifeEvent[] = [];
      let page = 1;
      let last: EventListResponse | null = null;
      do {
        last = await api.getEvents({ ...base, page, pageSize: 500, sort: 'start-asc', trash: false });
        collected.push(...last.events);
        page += 1;
      } while (last.pagination.totalPages >= page && page <= 20);

      if (requestId !== eventsRequest) return;
      events.value = collected;
      summary.value = last?.summary ?? summary.value;
      facets.value = last?.facets ?? facets.value;
      pagination.value = {
        page: 1,
        pageSize: collected.length || 500,
        total: collected.length,
        totalPages: 1,
      };
      query.value = { ...base, page: 1, pageSize: 500, sort: 'start-asc', type: 'all' };
    } finally {
      if (requestId === eventsRequest) isLoading.value = false;
    }
  }

  async function refreshEvents() {
    if (viewMode.value === 'all') await loadAllEvents();
    else await loadEvents();
  }

  async function loadTrash(next: Partial<EventQuery> = {}) {
    if (!me.value) return;
    const merged = { ...trashQuery.value, ...next };
    trashQuery.value = merged;
    const requestId = ++trashRequest;
    isLoadingTrash.value = true;
    try {
      const data = await api.getTrash(merged);
      if (requestId !== trashRequest) return;
      trash.value = data.events;
      trashPagination.value = data.pagination;
      trashLoaded.value = true;
      summary.value = data.summary;
      facets.value = data.facets;
    } finally {
      if (requestId === trashRequest) isLoadingTrash.value = false;
    }
  }

  async function loadInsights() {
    if (!me.value) return;
    isLoadingInsights.value = true;
    try {
      insights.value = await api.getInsights();
    } finally {
      isLoadingInsights.value = false;
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
    isSaving.value = true;
    try {
      const event = id ? await api.updateEvent(id, payload) : await api.createEvent(payload);
      await refreshEvents();
      if (insights.value) await loadInsights();
      toast.success(id ? `„${event.title}“ wurde aktualisiert.` : `„${event.title}“ wurde gespeichert.`);
      return event;
    } finally {
      isSaving.value = false;
    }
  }

  async function removeEvent(id: number) {
    const event = events.value.find((entry) => entry.id === id);
    await api.deleteEvent(id);
    await refreshEvents();
    if (insights.value) await loadInsights();
    if (trashLoaded.value) await loadTrash();
    toast.success(`„${event?.title ?? 'Eintrag'}“ liegt jetzt im Papierkorb.`, {
      label: 'Wiederherstellen',
      run: () => restoreEvent(id),
    });
  }

  async function restoreEvent(id: number) {
    const event = await api.restoreEvent(id);
    await refreshEvents();
    if (insights.value) await loadInsights();
    if (trashLoaded.value) await loadTrash();
    toast.success(`„${event.title}“ wurde wiederhergestellt.`);
    return event;
  }

  async function purgeEvent(id: number) {
    const event = trash.value.find((entry) => entry.id === id);
    await api.purgeEvent(id);
    await loadTrash();
    if (insights.value) await loadInsights();
    toast.info(`„${event?.title ?? 'Eintrag'}“ wurde endgültig gelöscht.`);
  }

  async function emptyTrash() {
    const result = await api.emptyTrash();
    await loadTrash();
    await refreshEvents();
    if (insights.value) await loadInsights();
    toast.info(`${result.removed} ${result.removed === 1 ? 'Eintrag wurde' : 'Einträge wurden'} endgültig gelöscht.`);
  }

  async function updateAccount(payload: Record<string, unknown>) {
    const data = await api.updateAccount(payload);
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    me.value = data.user;
    await loadAdminUsers();
    toast.success('Account wurde gespeichert.');
  }

  async function deleteAccount(password: string) {
    await api.deleteAccount(password);
    setCsrfToken('');
    reset();
  }

  async function createUser(payload: { name: string; color: string; email: string; password: string; role: 'admin' | 'user' }) {
    await api.createAdminUser(payload);
    await loadAdminUsers();
    toast.success('Benutzer wurde angelegt.');
  }

  async function updateUser(id: number, payload: Record<string, unknown>) {
    const data = await api.updateAdminUser(id, payload);
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    adminUsers.value = adminUsers.value.map((user) => (user.id === id ? data.user : user));
    if (me.value?.id === id) me.value = data.user;
  }

  async function exportData() {
    const filename = await api.exportData();
    toast.success(`Export erstellt: ${filename}`);
  }

  async function importData(payload: unknown) {
    const result = await api.importData(payload);
    await refreshEvents();
    if (insights.value) await loadInsights();
    if (trashLoaded.value) await loadTrash();
    const message = result.imported === 0
      ? `Keine neuen Ereignisse importiert (${result.skipped} Duplikate übersprungen).`
      : `${result.imported} ${result.imported === 1 ? 'Ereignis' : 'Ereignisse'} importiert${result.skipped ? `, ${result.skipped} Duplikate übersprungen` : ''}.`;
    toast.success(message);
    return result;
  }

  async function downloadBackup() {
    const filename = await api.downloadBackup();
    toast.success(`Datenbank-Backup heruntergeladen: ${filename}`);
  }

  function applyListResponse(data: EventListResponse) {
    events.value = data.events;
    summary.value = data.summary;
    facets.value = data.facets;
    pagination.value = data.pagination;
  }

  function categoryNames() {
    return [...new Set(events.value.flatMap((event) => splitCategories(event.category)))];
  }

  return {
    me,
    users,
    adminUsers,
    events,
    summary,
    facets,
    categories,
    pagination,
    query,
    trash,
    trashQuery,
    trashPagination,
    trashLoaded,
    insights,
    isLoading,
    isLoadingTrash,
    isLoadingInsights,
    isSaving,
    authReady,
    allowRegistration,
    appVersion,
    isAuthenticated,
    isAdmin,
    selectedUserId,
    trashCount,
    hasFilters,
    categoryNames,
    bootstrap,
    login,
    register,
    requestPasswordReset,
    confirmPasswordReset,
    logout,
    loadEvents,
    loadAllEvents,
    refreshEvents,
    loadTrash,
    loadInsights,
    loadAdminUsers,
    saveEvent,
    removeEvent,
    restoreEvent,
    purgeEvent,
    emptyTrash,
    updateAccount,
    deleteAccount,
    createUser,
    updateUser,
    exportData,
    importData,
    downloadBackup,
  };
});

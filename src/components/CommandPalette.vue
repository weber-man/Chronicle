<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="model" class="palette-overlay fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" @mousedown.self="close">
        <section
          class="palette-panel w-full max-w-2xl overflow-hidden rounded-[1.6rem] border border-amber-900/25 bg-[rgba(252,246,232,0.98)] shadow-[0_30px_80px_rgba(60,40,20,0.35)]"
          role="dialog"
          aria-modal="true"
          :aria-label="t('commandPalette.aria')"
        >
          <div class="flex items-center gap-3 border-b border-amber-900/15 px-4 py-3">
            <span class="grid h-8 w-8 place-items-center rounded-xl bg-amber-900/10 text-sm text-amber-950" aria-hidden="true">⌕</span>
            <input
              ref="inputRef"
              v-model="query"
              class="min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-stone-900 outline-none placeholder:text-stone-500"
              :placeholder="t('commandPalette.placeholder')"
              autocomplete="off"
              spellcheck="false"
              aria-controls="palette-results"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="runSelected"
              @keydown.esc.prevent="close"
            />
            <kbd class="hidden rounded-lg border border-amber-900/20 bg-white/50 px-2 py-1 text-[10px] text-stone-500 sm:block">ESC</kbd>
          </div>

          <div id="palette-results" class="max-h-[min(60vh,34rem)] overflow-y-auto p-2">
            <template v-if="filteredActions.length">
              <p class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{{ t('commandPalette.quickActions') }}</p>
              <button
                v-for="(action, index) in filteredActions"
                :key="action.id"
                type="button"
                class="palette-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                :class="{ 'is-selected': selectedIndex === index }"
                @mouseenter="selectedIndex = index"
                @click="runAction(action)"
              >
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-900/10 text-sm text-amber-950" aria-hidden="true">{{ action.icon }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-stone-900">{{ action.label }}</span>
                  <span class="block truncate text-xs text-stone-500">{{ action.hint }}</span>
                </span>
                <kbd v-if="action.shortcut" class="rounded-md border border-amber-900/15 bg-white/45 px-1.5 py-0.5 text-[10px] text-stone-500">{{ action.shortcut }}</kbd>
              </button>
            </template>

            <template v-if="events.length">
              <p class="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{{ t('commandPalette.events') }}</p>
              <button
                v-for="(event, index) in events"
                :key="event.id"
                type="button"
                class="palette-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                :class="{ 'is-selected': selectedIndex === actionOffset + index }"
                @mouseenter="selectedIndex = actionOffset + index"
                @click="runEvent(event)"
              >
                <span class="h-8 w-1 shrink-0 rounded-full" :style="{ backgroundColor: userColor(event.userId) }" aria-hidden="true"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-stone-900">{{ event.title }}</span>
                  <span class="block truncate text-xs text-stone-500">{{ formatEventRange(event) }} · {{ event.category }}</span>
                </span>
                <span class="hidden text-[10px] uppercase tracking-wide text-stone-400 sm:block">{{ t('commandPalette.open') }}</span>
              </button>
            </template>

            <p v-if="loading" class="px-3 py-6 text-center text-sm text-stone-500">{{ t('commandPalette.searching') }}</p>
            <p v-else-if="error" class="px-3 py-6 text-center text-sm text-rose-800">{{ error }}</p>
            <p v-else-if="!filteredActions.length && !events.length" class="px-3 py-10 text-center text-sm text-stone-500">
              {{ t('commandPalette.nothingFound') }}
            </p>
          </div>

          <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-amber-900/15 px-4 py-2.5 text-[11px] text-stone-500">
            <span>{{ t('commandPalette.navHint') }}</span>
            <span class="inline-flex items-center gap-1"><kbd class="rounded border border-amber-900/15 bg-white/45 px-1.5 py-0.5">⌘</kbd><kbd class="rounded border border-amber-900/15 bg-white/45 px-1.5 py-0.5">K</kbd> {{ t('commandPalette.anyTime') }}</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { formatEventRange } from '../lib/date';
import { translateApiError } from '../i18n';
import type { LifeEvent } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  shortcut?: string;
  keywords?: string;
  run: () => unknown;
};

const { t } = useI18n();
const model = defineModel<boolean>('open', { default: false });
const store = useLifelineStore();
const toast = useToastStore();
const router = useRouter();
const inputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const events = ref<LifeEvent[]>([]);
const selectedIndex = ref(0);
const loading = ref(false);
const error = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequest = 0;

const actions = computed<PaletteAction[]>(() => [
  {
    id: 'new-event',
    label: t('commandPalette.actionNewEventLabel'),
    hint: t('commandPalette.actionNewEventHint'),
    icon: '+',
    shortcut: 'N',
    keywords: t('commandPalette.keywords.newEvent'),
    run: () => router.push({ name: 'dashboard', query: { capture: 'manual' } }),
  },
  {
    id: 'timeline',
    label: t('commandPalette.actionTimelineLabel'),
    hint: t('commandPalette.actionTimelineHint'),
    icon: '◷',
    shortcut: 'T',
    keywords: t('commandPalette.keywords.timeline'),
    run: () => router.push({ name: 'timeline' }),
  },
  {
    id: 'insights',
    label: t('commandPalette.actionInsightsLabel'),
    hint: t('commandPalette.actionInsightsHint'),
    icon: '✧',
    shortcut: 'I',
    keywords: t('commandPalette.keywords.insights'),
    run: () => router.push({ name: 'insights' }),
  },
  {
    id: 'assistant',
    label: t('commandPalette.actionAssistantLabel'),
    hint: t('commandPalette.actionAssistantHint'),
    icon: '✦',
    shortcut: 'K',
    keywords: t('commandPalette.keywords.assistant'),
    run: () => router.push({ name: 'dashboard', query: { capture: 'ai' } }),
  },
  {
    id: 'trash',
    label: t('commandPalette.actionTrashLabel', { count: store.trashCount ? ` (${store.trashCount})` : '' }),
    hint: t('commandPalette.actionTrashHint'),
    icon: '♲',
    shortcut: 'P',
    keywords: t('commandPalette.keywords.trash'),
    run: () => router.push({ name: 'trash' }),
  },
  {
    id: 'account',
    label: t('commandPalette.actionAccountLabel'),
    hint: t('commandPalette.actionAccountHint'),
    icon: '⌂',
    shortcut: 'A',
    keywords: t('commandPalette.keywords.account'),
    run: () => router.push({ name: 'account', query: { from: '/' } }),
  },
  {
    id: 'export',
    label: t('commandPalette.actionExportLabel'),
    hint: t('commandPalette.actionExportHint'),
    icon: '↓',
    shortcut: 'E',
    keywords: t('commandPalette.keywords.exportData'),
    run: () => store.exportData(),
  },
]);

const filteredActions = computed(() => {
  const term = query.value.trim().toLocaleLowerCase('de');
  if (!term) return actions.value;
  return actions.value.filter((action) => `${action.label} ${action.hint} ${action.keywords ?? ''}`.toLocaleLowerCase('de').includes(term));
});

const actionOffset = computed(() => filteredActions.value.length);
const totalItems = computed(() => filteredActions.value.length + events.value.length);

watch(query, () => {
  selectedIndex.value = 0;
  scheduleSearch();
});

watch(model, (open) => {
  if (open) {
    query.value = '';
    selectedIndex.value = 0;
    error.value = '';
    void loadInitialEvents();
    void nextTick(() => inputRef.value?.focus());
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    if (searchTimer) clearTimeout(searchTimer);
  }
});

watch(totalItems, (total) => {
  if (selectedIndex.value >= total) selectedIndex.value = Math.max(0, total - 1);
});

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void searchEvents(query.value), 160);
}

async function loadInitialEvents() {
  events.value = store.events.slice(0, 5);
  await searchEvents('');
}

async function searchEvents(term: string) {
  const requestId = ++searchRequest;
  loading.value = true;
  error.value = '';
  try {
    const data = await api.getEvents({
      search: term.trim() || undefined,
      pageSize: 6,
      page: 1,
      sort: term.trim() ? 'start-desc' : 'updated-desc',
      type: 'all',
    });
    if (requestId !== searchRequest) return;
    events.value = data.events;
  } catch (err) {
    if (requestId !== searchRequest) return;
    error.value = translateApiError(err) || t('commandPalette.searchError');
  } finally {
    if (requestId === searchRequest) loading.value = false;
  }
}

function move(delta: number) {
  if (!totalItems.value) return;
  selectedIndex.value = (selectedIndex.value + delta + totalItems.value) % totalItems.value;
}

function runSelected() {
  if (!totalItems.value) return;
  const index = selectedIndex.value;
  if (index < filteredActions.value.length) {
    void runAction(filteredActions.value[index]);
    return;
  }
  const event = events.value[index - filteredActions.value.length];
  if (event) runEvent(event);
}

async function runAction(action: PaletteAction) {
  close();
  try {
    await action.run();
  } catch (err) {
    toast.error(translateApiError(err) || t('commandPalette.actionFailed'));
  }
}

function runEvent(event: LifeEvent) {
  close();
  void router.push({ name: 'dashboard', query: { search: event.title } });
}

function close() {
  model.value = false;
}

function userColor(userId: number) {
  return store.users.find((user) => user.id === userId)?.color ?? '#7b3f00';
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (document.querySelector('dialog[open]')) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('en') === 'k') {
    event.preventDefault();
    model.value = !model.value;
    return;
  }
  if (event.key === 'Escape' && model.value) {
    event.preventDefault();
    close();
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKeydown);
  document.body.style.overflow = '';
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

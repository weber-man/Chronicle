<template>
  <div ref="rootRef" class="relative" @focusout="handleFocusOut">
    <button
      ref="triggerRef"
      class="paper-input flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left disabled:opacity-60"
      type="button"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      @click="toggle"
      @keydown.down.prevent="openMenu"
      @keydown.up.prevent="openMenu"
      @keydown.esc.prevent="closeMenu(false)"
    >
      <span class="min-w-0 truncate">
        <span class="sr-only">{{ t('modelPicker.srModel') }}</span>
        {{ selectedLabel }}
      </span>
      <span
        class="shrink-0 text-xs text-stone-500 transition-transform"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      >
        ▾
      </span>
    </button>

    <Transition name="model-menu">
      <div
        v-if="open"
        class="absolute left-0 right-0 z-30 overflow-hidden rounded-2xl border border-amber-900/25 bg-[rgba(252,246,232,0.99)] shadow-[0_18px_40px_rgba(60,40,20,0.22)]"
        :class="dropUp ? 'bottom-full mb-2' : 'top-full mt-2'"
      >
        <div class="border-b border-amber-900/15 p-2">
          <div class="relative">
            <span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-stone-500" aria-hidden="true">⌕</span>
            <input
              ref="searchRef"
              v-model="query"
              class="paper-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm"
              type="text"
              role="combobox"
              :aria-label="t('modelPicker.searchAria')"
              aria-autocomplete="list"
              :aria-expanded="open"
              :aria-controls="listId"
              :aria-activedescendant="activeOptionId"
              :placeholder="t('modelPicker.searchPlaceholder')"
              autocomplete="off"
              spellcheck="false"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.home.prevent="moveTo(0)"
              @keydown.end.prevent="moveTo(filteredOptions.length - 1)"
              @keydown.enter.prevent="chooseActive"
              @keydown.esc.prevent="closeMenu(true)"
              @keydown.tab.shift="closeAfterFocusMove"
            />
          </div>
        </div>

        <div
          ref="listRef"
          class="relative max-h-64 overflow-y-auto px-1.5"
          tabindex="-1"
          @scroll.passive="handleScroll"
        >
          <div
            :id="listId"
            role="listbox"
            :aria-label="t('modelPicker.modelListAria')"
            :style="{ height: `${totalOptionHeight}px` }"
            class="relative"
          >
            <button
              v-for="entry in visibleOptions"
              :id="optionId(entry.index)"
              :key="entry.option.id"
              :data-model-index="entry.index"
              :aria-posinset="entry.index + 1"
              :aria-setsize="filteredOptions.length"
              :style="{ top: `${entry.index * OPTION_HEIGHT}px`, height: `${OPTION_HEIGHT}px` }"
              class="absolute inset-x-0 flex items-start gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition"
              :class="entry.index === activeIndex ? 'bg-amber-900/10' : 'hover:bg-amber-900/[0.06]'"
              type="button"
              role="option"
              :aria-selected="entry.option.id === modelValue"
              tabindex="-1"
              @mouseenter="activeIndex = entry.index"
              @click="selectOption(entry.option)"
            >
              <span
                class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]"
                :class="entry.option.id === modelValue
                  ? 'border-amber-900/35 bg-amber-900 text-amber-50'
                  : 'border-amber-900/20 text-transparent'"
                aria-hidden="true"
              >
                ✓
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-stone-900">{{ entry.option.name }}</span>
                <span class="mt-0.5 block truncate font-mono text-[11px] text-stone-500">{{ entry.option.id }}</span>
              </span>
              <span v-if="entry.option.contextLength" class="hidden shrink-0 pt-0.5 text-[11px] text-stone-500 sm:block">
                {{ formatContext(entry.option.contextLength) }}
              </span>
            </button>
          </div>

          <div v-if="!filteredOptions.length" class="px-3 py-6 text-center">
            <p class="text-sm text-stone-600">{{ t('modelPicker.noModel') }}</p>
            <button class="mt-2 text-xs text-amber-900 underline decoration-dotted underline-offset-4" type="button" @click="resetSearch">
              {{ t('modelPicker.resetSearch') }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-amber-900/15 px-3 py-2 text-[11px] text-stone-500">
          <span>{{ resultLabel }}</span>
          <span class="hidden sm:inline">{{ t('modelPicker.navHint') }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { i18n as i18nInstance } from '../i18n';
import type { AiModel } from '../lib/types';

const props = withDefaults(defineProps<{
  modelValue: string;
  models: AiModel[];
  disabled?: boolean;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();

const OPTION_HEIGHT = 58.5;
const OVERSCAN = 4;

const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const open = ref(false);
const dropUp = ref(false);
const query = ref('');
const activeIndex = ref(0);
const scrollTop = ref(0);
const viewportHeight = ref(256);
const idPrefix = useId();
const listId = `${idPrefix}-models`;
const contextFormatter = new Intl.NumberFormat(i18nInstance.global.locale.value === 'de' ? 'de-DE' : 'en-US');

const selectedOption = computed(() => props.models.find((option) => option.id === props.modelValue));
const selectedLabel = computed(() => selectedOption.value?.name || props.modelValue || t('modelPicker.selectModel'));

const filteredOptions = computed(() => {
  const terms = normalize(query.value).split(/\s+/).filter(Boolean);
  if (!terms.length) return props.models;
  return props.models.filter((option) => {
    const haystack = normalize(`${option.name} ${option.id}`);
    return terms.every((term) => haystack.includes(term));
  });
});

const activeOptionId = computed(() => (
  activeIndex.value >= 0 && activeIndex.value < filteredOptions.value.length
    ? optionId(activeIndex.value)
    : undefined
));

const totalOptionHeight = computed(() => filteredOptions.value.length * OPTION_HEIGHT);
const visibleOptions = computed(() => {
  const first = Math.max(0, Math.floor(scrollTop.value / OPTION_HEIGHT) - OVERSCAN);
  const last = Math.min(
    filteredOptions.value.length,
    Math.ceil((scrollTop.value + viewportHeight.value) / OPTION_HEIGHT) + OVERSCAN,
  );
  return filteredOptions.value.slice(first, last).map((option, offset) => ({
    option,
    index: first + offset,
  }));
});

const resultLabel = computed(() => {
  const total = props.models.length;
  const shown = filteredOptions.value.length;
  if (shown === total) return t('modelPicker.countModels', { count: total });
  return t('modelPicker.shownOf', { shown, total, count: total });
});

watch(query, () => {
  activeIndex.value = filteredOptions.value.length ? 0 : -1;
  scrollActiveOptionIntoView();
});

watch(() => filteredOptions.value.length, (length) => {
  if (!length) activeIndex.value = -1;
  else if (activeIndex.value < 0 || activeIndex.value >= length) activeIndex.value = 0;
});

watch(() => props.disabled, (disabled) => {
  if (disabled) closeMenu(false);
});

onClickOutside(rootRef, () => {
  if (open.value) closeMenu(false);
});

useEventListener(window, 'resize', () => {
  if (!open.value) return;
  updateDropUp();
  updateViewportHeight();
});

function toggle() {
  if (open.value) closeMenu(false);
  else openMenu();
}

async function openMenu() {
  if (props.disabled || open.value) return;
  updateDropUp();
  open.value = true;
  query.value = '';
  const selectedIndex = filteredOptions.value.findIndex((option) => option.id === props.modelValue);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : (filteredOptions.value.length ? 0 : -1);
  await nextTick();
  searchRef.value?.focus();
  updateViewportHeight();
  scrollActiveOptionIntoView();
}

function closeMenu(restoreFocus: boolean) {
  if (!open.value) return;
  open.value = false;
  query.value = '';
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus());
}

function handleFocusOut(event: FocusEvent) {
  if (!open.value) return;
  const next = event.relatedTarget;
  if (next instanceof Node && rootRef.value?.contains(next)) return;
  // Wait until the browser has moved focus before removing the popup.
  window.setTimeout(() => {
    if (!rootRef.value?.contains(document.activeElement)) closeMenu(false);
  }, 0);
}

function closeAfterFocusMove() {
  window.setTimeout(() => closeMenu(false), 0);
}

function updateDropUp() {
  const rect = rootRef.value?.getBoundingClientRect();
  if (!rect) return;
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  // The full menu can reach roughly 350px; flip when below cannot hold it.
  dropUp.value = below < 360 && above > below;
}

function move(step: number) {
  const length = filteredOptions.value.length;
  if (!length) return;
  if (activeIndex.value < 0) activeIndex.value = step > 0 ? 0 : length - 1;
  else activeIndex.value = (activeIndex.value + step + length) % length;
  scrollActiveOptionIntoView();
}

function moveTo(index: number) {
  if (!filteredOptions.value.length) return;
  activeIndex.value = Math.max(0, Math.min(index, filteredOptions.value.length - 1));
  scrollActiveOptionIntoView();
}

function chooseActive() {
  const option = filteredOptions.value[activeIndex.value];
  if (option) selectOption(option);
}

function selectOption(option: AiModel) {
  emit('update:modelValue', option.id);
  closeMenu(true);
}

function resetSearch() {
  query.value = '';
  searchRef.value?.focus();
}

function handleScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function scrollActiveOptionIntoView() {
  const list = listRef.value;
  if (!list || activeIndex.value < 0) return;
  const top = activeIndex.value * OPTION_HEIGHT;
  const bottom = top + OPTION_HEIGHT;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  scrollTop.value = list.scrollTop;
}

function updateViewportHeight() {
  if (listRef.value) viewportHeight.value = listRef.value.clientHeight;
}

function optionId(index: number) {
  return `${idPrefix}-model-${index}`;
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de');
}

function formatContext(value: number) {
  return `${contextFormatter.format(value)} ${t('modelPicker.tokenUnit')}`;
}
</script>

<style scoped>
.model-menu-enter-active,
.model-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.model-menu-enter-from,
.model-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .model-menu-enter-active,
  .model-menu-leave-active {
    transition: none;
  }
}
</style>

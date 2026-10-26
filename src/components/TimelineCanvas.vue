<template>
  <section class="paper-panel chronicle-timeline" :aria-label="t('timeline.kicker')">
    <div v-if="!events.length" class="chronicle-empty"><CalendarDays :size="32" :stroke-width="1.2" /><h2 class="paper-heading">{{ t('timeline.emptyTitle') }}</h2><p>{{ t('timeline.empty') }}</p><RouterLink class="ink-button rounded-xl px-4 py-2 text-sm" :to="{ name: 'dashboard', query: { capture: 'manual' } }">{{ t('eventForm.modeCreate') }}</RouterLink></div>
    <template v-else>
      <div class="chronicle-filters">
        <label class="chronicle-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">{{ t('timeline.search') }}</span><input v-model="search" class="paper-input" :placeholder="t('timeline.searchPlaceholder')" type="search" /></label>
        <label><span>{{ t('timeline.type') }}</span><select v-model="typeFilter" class="paper-input"><option value="all">{{ t('eventList.typeAll') }}</option><option value="points">{{ t('eventList.typePoints') }}</option><option value="ranges">{{ t('eventList.typeRanges') }}</option><option value="ongoing">{{ t('eventList.typeOngoing') }}</option></select></label>
        <label><span>{{ t('timeline.category') }}</span><select v-model="categoryFilter" class="paper-input"><option value="all">{{ t('common.allCategories') }}</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select></label>
        <label><span>{{ t('timeline.sort') }}</span><select v-model="sortMode" class="paper-input"><option value="start-asc">{{ t('eventList.sortStartAsc') }}</option><option value="start-desc">{{ t('eventList.sortStartDesc') }}</option><option value="duration-desc">{{ t('eventList.sortDurationDesc') }}</option><option value="title-asc">{{ t('eventList.sortTitleAsc') }}</option></select></label>
      </div>

      <div class="chronicle-atlas">
        <div class="chronicle-atlas-heading"><span>{{ t('timeline.yearsOverview') }}</span><span>{{ t('timeline.overviewHint') }}</span></div>
        <div class="chronicle-density" :style="{ gridTemplateColumns: `repeat(${density.length}, minmax(0, 1fr))` }" role="group" :aria-label="t('timeline.yearsOverview')">
          <button v-for="(bin, index) in density" :key="bin.year" type="button" :aria-label="t('timeline.yearCount', { year: bin.year === bin.endYear ? bin.year : `${bin.year}–${bin.endYear}`, count: bin.count })" :title="t('timeline.yearCount', { year: bin.year === bin.endYear ? bin.year : `${bin.year}–${bin.endYear}`, count: bin.count })" :aria-pressed="zoom !== 'all' && bin.year <= windowEndYear && bin.endYear >= windowStartYear" :class="{ 'in-window': bin.year <= windowEndYear && bin.endYear >= windowStartYear }" @click="focusYear(bin.year, bin.endYear - bin.year + 1)">
            <span class="chronicle-density-bar" :style="{ height: `${Math.max(5, bin.count / maxDensity * 100)}%` }"></span><span v-if="index === 0 || index === density.length - 1 || (bin.year % 5 === 0 && index > 2 && index < density.length - 3)" class="chronicle-density-year">{{ bin.year }}</span>
          </button>
        </div>
      </div>

      <div class="chronicle-period-toolbar">
        <div class="chronicle-period"><span class="chronicle-eyebrow">{{ t('timeline.visiblePeriod') }}</span><h2 class="paper-heading" aria-live="polite">{{ windowStartYear === windowEndYear ? windowStartYear : `${windowStartYear} — ${windowEndYear}` }}</h2></div>
        <div class="chronicle-window-actions">
          <div class="chronicle-zoom paper-nav" role="group" :aria-label="t('timeline.zoom')"><button v-for="option in zoomOptions" :key="option.value" type="button" :aria-pressed="zoom === option.value" @click="setZoom(option.value)">{{ option.label }}</button></div>
          <div class="chronicle-step"><button class="paper-button" type="button" :disabled="zoom === 'all' || windowStartYear <= firstYear" :aria-label="t('timeline.previousPeriod')" @click="moveWindow(-1)"><ChevronLeft :size="17" /></button><button class="paper-button" type="button" :disabled="zoom === 'all' || windowEndYear >= lastYear" :aria-label="t('timeline.nextPeriod')" @click="moveWindow(1)"><ChevronRight :size="17" /></button></div>
          <button class="paper-button chronicle-today-button" type="button" @click="focusYear(currentYear)">{{ t('date.today') }}</button>
        </div>
      </div>

      <div class="chronicle-result-line"><span aria-live="polite">{{ t('timeline.visibleCount', { shown: visibleEvents.length, total: events.length }) }}</span><button v-if="hasFilters || zoom !== 'all'" type="button" @click="resetView">{{ t('eventList.resetFilters') }}</button><div class="chronicle-legend"><span><i class="legend-point"></i>{{ t('timeline.point') }}</span><span><i class="legend-range"></i>{{ t('timeline.range') }}</span><span><i class="legend-ongoing"></i>{{ t('timeline.ongoing') }}</span></div></div>

      <div v-if="!visibleEvents.length" class="chronicle-empty"><Search :size="28" :stroke-width="1.2" /><h3 class="paper-heading">{{ t('timeline.noMatchesTitle') }}</h3><p>{{ t('timeline.emptyFilters') }}</p><button class="paper-button rounded-xl px-4 py-2 text-sm" type="button" @click="resetView">{{ t('timeline.showAll') }}</button></div>
      <template v-else>
        <div ref="scrollArea" class="chronicle-scroll chronicle-desktop" role="region" tabindex="0" :aria-label="t('timeline.chartAria')">
          <div class="chronicle-chart">
            <div class="chronicle-axis"><div class="chronicle-axis-label">{{ t('timeline.eventColumn') }}<span>{{ t('timeline.openHint') }}</span></div><div ref="axis" class="chronicle-axis-track"><div class="chronicle-axis-rule"></div><span v-for="tick in ticks" :key="tick.value" class="chronicle-tick" :style="{ left: `${position(tick.value)}%` }">{{ tick.label }}</span><span v-if="todayInWindow" class="chronicle-today-label" :style="{ left: `${position(today)}%` }">{{ t('date.today') }}</span></div></div>
            <div class="chronicle-chart-body">
              <div class="chronicle-grid" aria-hidden="true"><i v-for="tick in ticks" :key="tick.value" :style="{ left: `${position(tick.value)}%` }"></i><i v-if="todayInWindow" class="chronicle-today-line" :style="{ left: `${position(today)}%` }"></i></div>
              <button v-for="event in positionedEvents" :key="event.id" type="button" class="chronicle-row" :aria-label="t('timeline.openEvent', { title: event.title })" :title="`${event.title} · ${formatEventRange(event)}`" @click="openDetails(event)">
                <span class="chronicle-event-label"><strong>{{ event.title }}</strong><span>{{ formatEventRange(event) }}<i v-if="event.isOngoing" class="chronicle-ongoing-badge">{{ t('timeline.ongoing') }}</i></span></span>
                <span class="chronicle-track" :style="{ '--event-color': userColor(event.userId) }"><span class="chronicle-track-rule"></span><span v-if="event.isInstant" class="chronicle-event-point" :style="{ left: `${event.left}%` }"></span><span v-else class="chronicle-event-bar" :class="{ 'is-ongoing': event.isOngoing, 'is-clipped-start': event.clippedStart, 'is-clipped-end': event.clippedEnd }" :style="{ left: `${event.left}%`, width: `${event.width}%`, maxWidth: `${100 - event.left}%` }"><span v-if="event.isOngoing" class="chronicle-bar-arrow" aria-hidden="true">›</span></span></span>
              </button>
            </div>
          </div>
        </div>

        <div ref="mobileScrollArea" class="chronicle-mobile-list" role="region" tabindex="0" :aria-label="t('timeline.chartAria')">
          <template v-for="(event, index) in visibleEvents" :key="event.id">
            <div v-if="sortMode.startsWith('start') && (index === 0 || visibleEvents[index - 1].startDate.year !== event.startDate.year)" class="chronicle-year-heading paper-heading">{{ event.startDate.year }}</div>
            <button type="button" class="chronicle-mobile-event" :aria-label="t('timeline.openEvent', { title: event.title })" @click="openDetails(event)"><span class="chronicle-mobile-dot" :class="{ 'is-range': event.endDate }" :style="{ backgroundColor: userColor(event.userId) }"></span><span><strong>{{ event.title }}</strong><span class="chronicle-mobile-date">{{ formatEventRange(event) }}</span><span class="chronicle-mobile-category">{{ splitCategories(event.category)[0] }}<i v-if="event.isOngoing">{{ t('timeline.ongoing') }}</i></span></span><ChevronRight :size="15" /></button>
          </template>
        </div>
        <p class="chronicle-scroll-note"><MousePointer2 :size="13" />{{ t('timeline.scrollHint') }}</p>
      </template>
    </template>

    <Teleport to="body"><dialog ref="detailDialog" class="chronicle-detail paper-panel" :aria-label="selected?.title" @cancel.prevent="closeDetails"><template v-if="selected"><div class="chronicle-detail-top"><span class="chronicle-eyebrow">{{ selected.isOngoing ? t('timeline.ongoing') : selected.endDate ? t('timeline.range') : t('timeline.point') }}</span><button class="paper-button" type="button" :aria-label="t('common.close')" @click="closeDetails"><X :size="18" /></button></div><h2 class="paper-heading">{{ selected.title }}</h2><p class="chronicle-detail-date"><CalendarDays :size="17" />{{ formatEventRange(selected) }}</p><div class="chronicle-detail-tags"><span v-for="category in splitCategories(selected.category)" :key="category" class="paper-chip">{{ category }}</span></div><p v-if="selected.description" class="chronicle-detail-description">{{ selected.description }}</p><dl class="chronicle-detail-meta"><div><dt>{{ t('timeline.author') }}</dt><dd><span :style="{ backgroundColor: userColor(selected.userId) }"></span>{{ userName(selected.userId) }}</dd></div><div v-if="selected.endDate"><dt>{{ t('timeline.duration') }}</dt><dd>{{ durationLabel(selected) }}</dd></div></dl><div class="chronicle-detail-actions"><button class="ink-button" type="button" @click="editSelected"><Pencil :size="16" />{{ t('eventList.edit') }}</button><RouterLink class="paper-button" :to="{ name: 'dashboard', query: { search: selected.title } }">{{ t('timeline.openInList') }}<ArrowUpRight :size="15" /></RouterLink></div></template></dialog></Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, MousePointer2, Pencil, Search, X } from 'lucide-vue-next';
import { eventDurationLabel, formatEventRange, numericValue } from '../lib/date';
import { DAY_MS, eventEnd, overlapsWindow, positionEvent, timelineDomain, timelineTicks, todayValue, yearBoundary, yearDensity } from '../lib/timeline';
import { splitCategories, type LifeEvent, type User } from '../lib/types';
import '../assets/timeline.css';

const props = defineProps<{ events: LifeEvent[]; users: User[] }>();
const emit = defineEmits<{ edit: [event: LifeEvent] }>();
const { t, locale } = useI18n();
const search = ref('');
const typeFilter = ref('all');
const categoryFilter = ref('all');
const sortMode = ref('start-asc');
const zoom = ref<'all' | number>('all');
const anchorYear = ref(new Date().getFullYear());
const today = todayValue();
const currentYear = new Date(today * DAY_MS).getUTCFullYear();
const axis = ref<HTMLElement | null>(null);
const scrollArea = ref<HTMLElement | null>(null);
const mobileScrollArea = ref<HTMLElement | null>(null);
const axisWidth = ref(760);
const detailDialog = ref<HTMLDialogElement | null>(null);
const selected = ref<LifeEvent | null>(null);
let resizeObserver: ResizeObserver | null = null;
let previousOverflow: string | null = null;
const domain = computed(() => timelineDomain(props.events, today));
const firstYear = computed(() => new Date(domain.value.min * DAY_MS).getUTCFullYear());
const lastYear = computed(() => new Date((domain.value.max - 1) * DAY_MS).getUTCFullYear());
const viewWindow = computed(() => zoom.value === 'all' ? domain.value : { min: yearBoundary(anchorYear.value), max: yearBoundary(anchorYear.value + zoom.value) });
const windowStartYear = computed(() => new Date(viewWindow.value.min * DAY_MS).getUTCFullYear());
const windowEndYear = computed(() => new Date((viewWindow.value.max - 1) * DAY_MS).getUTCFullYear());
const zoomOptions = computed(() => [{ value: 'all' as const, label: t('timeline.allYears') }, { value: 10, label: t('timeline.zoomYears', { count: 10 }) }, { value: 5, label: t('timeline.zoomYears', { count: 5 }) }, { value: 1, label: t('timeline.zoomYear') }]);
const categories = computed(() => [...new Set(props.events.flatMap(event => splitCategories(event.category)))].sort((a, b) => a.localeCompare(b, locale.value)));
const hasFilters = computed(() => Boolean(search.value.trim() || typeFilter.value !== 'all' || categoryFilter.value !== 'all'));
const filteredEvents = computed(() => {
  const term = search.value.trim().toLocaleLowerCase(locale.value);
  return props.events.filter(event => {
    if (typeFilter.value === 'points' && (event.endDate || event.isOngoing)) return false;
    if (typeFilter.value === 'ranges' && !event.endDate) return false;
    if (typeFilter.value === 'ongoing' && !event.isOngoing) return false;
    if (categoryFilter.value !== 'all' && !splitCategories(event.category).includes(categoryFilter.value)) return false;
    return !term || `${event.title} ${event.description} ${event.category} ${userName(event.userId)}`.toLocaleLowerCase(locale.value).includes(term);
  }).sort((a, b) => {
    const startA = numericValue(a.startDate), startB = numericValue(b.startDate);
    if (sortMode.value === 'start-desc') return startB - startA || b.id - a.id;
    if (sortMode.value === 'duration-desc') return (b.endDate || b.isOngoing ? eventEnd(b, today) - startB : 0) - (a.endDate || a.isOngoing ? eventEnd(a, today) - startA : 0) || startA - startB;
    if (sortMode.value === 'title-asc') return a.title.localeCompare(b.title, locale.value) || startA - startB;
    return startA - startB || a.id - b.id;
  });
});
const visibleEvents = computed(() => filteredEvents.value.filter(event => overlapsWindow(event, viewWindow.value, today)));
const positionedEvents = computed(() => visibleEvents.value.map(event => ({ ...event, ...positionEvent(event, viewWindow.value, today) })));
const ticks = computed(() => timelineTicks(viewWindow.value, axisWidth.value, locale.value));
const density = computed(() => yearDensity(filteredEvents.value, domain.value));
const maxDensity = computed(() => Math.max(1, ...density.value.map(bin => bin.count)));
const todayInWindow = computed(() => today >= viewWindow.value.min && today < viewWindow.value.max);
function position(value: number) { return (value - viewWindow.value.min) / Math.max(1, viewWindow.value.max - viewWindow.value.min) * 100; }
function setZoom(value: 'all' | number) {
  if (value !== 'all') {
    const center = (windowStartYear.value + windowEndYear.value) / 2;
    anchorYear.value = Math.max(firstYear.value, Math.min(Math.floor(center - (value - 1) / 2), Math.max(firstYear.value, lastYear.value - value + 1)));
  }
  zoom.value = value;
}
function focusYear(year: number, size = 1) { anchorYear.value = year; zoom.value = size; }
function moveWindow(direction: number) {
  if (zoom.value === 'all') return;
  anchorYear.value = Math.max(firstYear.value, Math.min(anchorYear.value + direction * zoom.value, Math.max(firstYear.value, lastYear.value - zoom.value + 1)));
}
function resetView() { search.value = ''; typeFilter.value = 'all'; categoryFilter.value = 'all'; zoom.value = 'all'; }
function userColor(id: number) { return props.users.find(user => user.id === id)?.color ?? '#805738'; }
function userName(id: number) { return props.users.find(user => user.id === id)?.name ?? t('common.unknown'); }
function durationLabel(event: LifeEvent) {
  const end = new Date(today * DAY_MS);
  return eventDurationLabel(event.isOngoing ? { ...event, isOngoing: false, endDate: { precision: 'day', year: end.getUTCFullYear(), month: end.getUTCMonth() + 1, day: end.getUTCDate() } } : event);
}
async function openDetails(event: LifeEvent) {
  selected.value = event;
  await nextTick();
  if (!detailDialog.value?.open) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    detailDialog.value?.showModal();
  }
}
function closeDetails() {
  detailDialog.value?.close();
  selected.value = null;
  if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
  previousOverflow = null;
}
function editSelected() { const event = selected.value; closeDetails(); if (event) emit('edit', event); }
function observeAxis() {
  resizeObserver?.disconnect();
  if (axis.value) resizeObserver?.observe(axis.value);
}
watch(axis, observeAxis);
watch([search, typeFilter, categoryFilter, sortMode, zoom, anchorYear], () => {
  if (scrollArea.value) scrollArea.value.scrollTop = 0;
  if (mobileScrollArea.value) mobileScrollArea.value.scrollTop = 0;
});
onMounted(() => {
  resizeObserver = new ResizeObserver(entries => { axisWidth.value = entries[0]?.contentRect.width || 760; });
  observeAxis();
});
onBeforeUnmount(() => { resizeObserver?.disconnect(); closeDetails(); });
</script>

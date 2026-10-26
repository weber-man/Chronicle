<template>
  <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-stone-500">{{ t('insights.kicker') }}</p>
        <h2 class="paper-heading text-2xl font-semibold text-stone-900">{{ t('insights.heading') }}</h2>
        <p class="mt-1 text-sm text-stone-500">{{ t('insights.subtitle', { range: rangeLabel, count: insights.totalEvents }) }}</p>
      </div>
      <RouterLink v-if="insights.trashEvents" :to="{ name: 'trash' }" class="paper-button rounded-2xl px-4 py-2 text-sm">
        {{ t('insights.inTrash', { count: insights.trashEvents }) }}
      </RouterLink>
    </div>

    <div v-if="!insights.totalEvents" class="mt-6 rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      {{ t('insights.emptyText') }}
    </div>

    <template v-else>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="insight-tile rounded-2xl border border-amber-900/15 bg-white/45 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.tileRange') }}</p>
          <p class="paper-heading mt-2 text-xl font-semibold text-stone-900">{{ t('date.yearsDuration', { count: insights.coverageYears }) }}</p>
          <p class="mt-1 text-xs text-stone-500">{{ t('insights.fromTo', { from: insights.fromYear, to: insights.toYear }) }}</p>
        </div>
        <div class="insight-tile rounded-2xl border border-amber-900/15 bg-white/45 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.tileLongest') }}</p>
          <p class="paper-heading mt-2 truncate text-xl font-semibold text-stone-900" :title="insights.longestEvent?.title">{{ insights.longestEvent?.title }}</p>
          <p class="mt-1 text-xs text-stone-500">{{ formatDays(insights.longestEvent?.days ?? 0) }}</p>
        </div>
        <div class="insight-tile rounded-2xl border border-amber-900/15 bg-white/45 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.tileBusiestYear') }}</p>
          <p class="paper-heading mt-2 text-xl font-semibold text-stone-900">{{ insights.busiestYear?.year ?? '–' }}</p>
          <p class="mt-1 text-xs text-stone-500">{{ t('eventList.count', { count: insights.busiestYear?.count ?? 0 }) }}</p>
        </div>
        <div class="insight-tile rounded-2xl border border-amber-900/15 bg-white/45 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.tileDays') }}</p>
          <p class="paper-heading mt-2 text-xl font-semibold text-stone-900">{{ numberFormat.format(insights.coveredDays) }}</p>
          <p class="mt-1 text-xs text-stone-500">{{ t('insights.perEntryAvg', { days: formatDays(insights.averageDurationDays) }) }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div class="rounded-3xl border border-amber-900/15 bg-white/35 p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="paper-heading text-lg font-semibold text-stone-900">{{ t('insights.chartEventsPerYear') }}</h3>
            <span class="text-xs text-stone-500">{{ t('insights.chartStartYear') }}</span>
          </div>
          <div class="mt-4 flex h-56 items-end gap-1 overflow-x-auto pb-1" role="img" :aria-label="t('insights.ariaBarChart')">
            <div v-for="entry in insights.perYear" :key="entry.year" class="group flex h-full min-w-[16px] flex-1 flex-col items-center justify-end gap-1" :title="t('insights.barTitle', { year: entry.year, count: entry.count })">
              <span class="text-[9px] tabular-nums text-stone-500 opacity-0 transition group-hover:opacity-100">{{ entry.count }}</span>
              <div
                class="w-full max-w-12 rounded-t-md bg-gradient-to-t from-amber-900/70 to-amber-500/75 transition group-hover:from-amber-900 group-hover:to-amber-400"
                :style="{ height: barHeight(entry.count) }"
              ></div>
              <span class="text-[9px] tabular-nums text-stone-500">{{ showYearLabel(entry.year) ? entry.year : '' }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-amber-900/15 bg-white/35 p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="paper-heading text-lg font-semibold text-stone-900">{{ t('insights.categories') }}</h3>
            <span class="text-xs text-stone-500">{{ t('insights.topics', { count: insights.categories.length }) }}</span>
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="category in insights.categories.slice(0, 10)" :key="category.name">
              <div class="flex items-baseline justify-between gap-3 text-xs">
                <span class="truncate text-stone-700">{{ category.name }}</span>
                <span class="shrink-0 tabular-nums text-stone-500">{{ category.count }}</span>
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-full bg-amber-900/10">
                <div class="h-full rounded-full" :style="{ width: `${Math.max(4, (category.count / maxCategoryCount) * 100)}%`, background: accentGradient }"></div>
              </div>
            </div>
            <p v-if="insights.categories.length > 10" class="pt-1 text-xs text-stone-500">{{ t('insights.moreCategories', { count: insights.categories.length - 10 }) }}</p>
          </div>
        </div>
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-3">
        <div class="rounded-2xl border border-amber-900/15 bg-white/40 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.earliest') }}</p>
          <p v-if="insights.firstEvent" class="mt-2 truncate text-sm font-semibold text-stone-900">{{ insights.firstEvent.title }}</p>
          <p v-if="insights.firstEvent" class="mt-1 text-xs text-stone-500">{{ formatTimelineDate(insights.firstEvent.date) }}</p>
        </div>
        <div class="rounded-2xl border border-amber-900/15 bg-white/40 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.latest') }}</p>
          <p v-if="insights.lastEvent" class="mt-2 truncate text-sm font-semibold text-stone-900">{{ insights.lastEvent.title }}</p>
          <p v-if="insights.lastEvent" class="mt-1 text-xs text-stone-500">{{ formatTimelineDate(insights.lastEvent.date) }}</p>
        </div>
        <div class="rounded-2xl border border-amber-900/15 bg-white/40 p-4">
          <p class="text-xs uppercase tracking-[0.16em] text-stone-500">{{ t('insights.ongoingNow') }}</p>
          <p class="paper-heading mt-2 text-2xl font-semibold text-stone-900">{{ insights.ongoingEvents }}</p>
          <p class="mt-1 text-xs text-stone-500">{{ t('insights.ongoingHint') }}</p>
        </div>
      </div>

      <p class="mt-4 text-[11px] text-stone-500">{{ t('insights.footnote') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatTimelineDate } from '../lib/date';
import { i18n as i18nInstance } from '../i18n';
import type { Insights } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';

const props = defineProps<{ insights: Insights }>();
const store = useLifelineStore();
const { t } = useI18n();

const rangeLabel = computed(() => (props.insights.totalEvents ? props.insights.rangeLabel : t('common.nothingYet')));
const numberFormat = new Intl.NumberFormat(i18nInstance.global.locale.value === 'de' ? 'de-DE' : 'en-US');
const maxCategoryCount = computed(() => Math.max(1, ...props.insights.categories.map((category) => category.count)));
const maxYearCount = computed(() => Math.max(1, ...props.insights.perYear.map((entry) => entry.count)));
const accentGradient = computed(() => {
  const color = store.me?.color ?? '#7c3aed';
  return `linear-gradient(90deg, ${color}dd, ${color}88)`;
});

function barHeight(count: number) {
  if (!count) return '2px';
  return `${Math.max(5, (count / maxYearCount.value) * 100)}%`;
}

function showYearLabel(index: number) {
  const years = props.insights.perYear;
  if (years.length <= 18) return true;
  const step = Math.ceil(years.length / 12);
  return index % step === 0 || index === years.length - 1;
}

function formatDays(days: number) {
  if (days < 31) return t('date.daysDuration', { count: days });
  if (days < 366) return t('date.monthsDuration', { count: Math.max(1, Math.round(days / 30)) });
  return t('date.yearsDuration', { count: Math.max(1, Math.round(days / 365)) });
}
</script>

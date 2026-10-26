<template>
  <div class="min-w-0 rounded-2xl border border-amber-900/15 bg-[rgba(255,252,244,0.72)] p-4">
    <div>
      <p class="paper-heading text-sm font-medium text-stone-900">{{ label }}</p>
      <p class="text-xs text-stone-500">{{ t('date.precisionHint') }}</p>
    </div>

    <select v-model="model.precision" class="paper-input mt-3 w-full rounded-2xl px-4 py-3" :aria-label="`${label}: ${t('date.precisionHint')}`">
      <option value="year">{{ t('date.yearOnly') }}</option>
      <option value="month">{{ t('date.monthYear') }}</option>
      <option value="day">{{ t('date.dayMonthYear') }}</option>
    </select>

    <div class="mt-3 grid gap-3" :class="fieldGridClass">
      <label class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">{{ t('date.year') }}</span>
        <input
          v-model.number="model.year"
          type="number"
          min="0"
          max="9999"
          inputmode="numeric"
          class="paper-input w-full min-w-0 rounded-2xl px-4 py-3"
          placeholder="2025"
        />
      </label>

      <label v-if="model.precision !== 'year'" class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">{{ t('date.month') }}</span>
        <select v-model.number="model.month" class="paper-input w-full min-w-0 rounded-2xl px-4 py-3">
          <option :value="null" disabled>{{ t('date.chooseMonth') }}</option>
          <option v-for="month in months" :key="month.value" :value="month.value">{{ month.label }}</option>
        </select>
      </label>

      <label v-if="model.precision === 'day'" class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">{{ t('date.day') }}</span>
        <select v-model.number="model.day" class="paper-input w-full min-w-0 rounded-2xl px-4 py-3">
          <option :value="null" disabled>{{ t('date.chooseDay') }}</option>
          <option v-for="day in daysInSelectedMonth" :key="day" :value="day">{{ day }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TimelineDate } from '../lib/types';

const model = defineModel<TimelineDate>({ required: true });
defineProps<{ label: string }>();

const { t } = useI18n();

const months = computed(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  .map((value) => ({ value, label: t(`date.months.${value}`) })));

const fieldGridClass = computed(() => {
  if (model.value.precision === 'day') return 'md:grid-cols-3';
  if (model.value.precision === 'month') return 'md:grid-cols-2';
  return 'md:grid-cols-1';
});

const daysInSelectedMonth = computed(() => {
  const year = Number(model.value.year) || 2000;
  const month = Number(model.value.month) || 1;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
});

watch(
  () => model.value.precision,
  (precision) => {
    if (precision === 'year') {
      model.value = { ...model.value, month: null, day: null };
    } else if (precision === 'month') {
      model.value = { ...model.value, day: null };
    }
  },
);

watch(
  () => [model.value.year, model.value.month] as const,
  () => {
    if (model.value.precision !== 'day') return;
    if (model.value.day && model.value.day > daysInSelectedMonth.value) {
      model.value = { ...model.value, day: null };
    }
  },
);
</script>

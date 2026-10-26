<template>
  <section class="paper-panel rounded-[2rem] p-5 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{{ t('aiComposer.kicker') }}</p>
        <h2 class="paper-heading mt-1 text-xl font-semibold text-stone-900">{{ t('aiComposer.heading') }}</h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
          {{ t('aiComposer.intro') }}
        </p>
      </div>
      <span v-if="store.selectedModel" class="paper-chip max-w-full truncate rounded-full px-3 py-1.5 text-[11px] text-stone-600">
        {{ store.selectedModel }}
      </span>
    </div>

    <form class="mt-4 grid gap-3" @submit.prevent="generate">
      <label class="grid gap-2">
        <span class="sr-only">{{ t('aiComposer.srDescribe') }}</span>
        <textarea
          v-model="prompt"
          rows="4"
          maxlength="4000"
          class="paper-input w-full resize-y rounded-2xl px-4 py-3 leading-6"
          :placeholder="t('aiComposer.placeholder')"
          :disabled="busy"
          @keydown.ctrl.enter.prevent="generate"
          @keydown.meta.enter.prevent="generate"
        ></textarea>
      </label>
      <div class="flex flex-wrap items-center gap-3">
        <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" type="submit" :disabled="busy || prompt.trim().length < 3">
          {{ generating ? t('aiComposer.generating') : draft ? t('aiComposer.newSuggestion') : t('aiComposer.generateSuggestion') }}
        </button>
        <span class="text-xs text-stone-500">{{ t('aiComposer.enterHint') }}</span>
      </div>
    </form>

    <p v-if="error" class="mt-4 rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950" role="alert" aria-live="assertive">
      {{ error }}
    </p>

    <div v-if="generating && !draft" class="mt-5 grid gap-3" aria-live="polite">
      <div class="h-4 w-2/5 animate-pulse rounded-full bg-amber-900/10"></div>
      <div class="h-24 animate-pulse rounded-2xl bg-amber-900/[0.06]"></div>
      <span class="text-xs text-stone-500">{{ t('aiComposer.draftValidating') }}</span>
    </div>

    <form v-if="draft" class="mt-6 grid gap-4 border-t border-amber-900/15 pt-5" novalidate @submit.prevent="save">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900">{{ t('aiComposer.previewKicker') }}</p>
          <h3 class="paper-heading mt-1 text-lg font-semibold text-stone-900">{{ t('aiComposer.previewHeading') }}</h3>
        </div>
        <span v-if="revisionCount" class="rounded-full border border-amber-900/15 bg-amber-100/70 px-3 py-1 text-[11px] text-amber-950">
          {{ t('aiComposer.revised', { count: revisionCount }) }}
        </span>
        <span v-else-if="generatedModel" class="text-[11px] text-stone-500">{{ t('aiComposer.suggestionFrom', { model: generatedModel }) }}</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">{{ t('aiComposer.title') }} <span class="text-rose-800" aria-hidden="true">*</span></span>
          <input v-model="draft.title" class="paper-input w-full rounded-2xl px-4 py-3" maxlength="120" required />
        </label>
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">{{ t('aiComposer.categories') }}</span>
          <input
            v-model="draft.category"
            list="ai-category-suggestions"
            class="paper-input w-full rounded-2xl px-4 py-3"
            :placeholder="t('aiComposer.placeholderCategories')"
            maxlength="200"
          />
          <datalist id="ai-category-suggestions">
            <option v-for="category in lifeline.categories" :key="category.name" :value="category.name" />
          </datalist>
        </label>
      </div>

      <label class="grid min-w-0 gap-2">
        <span class="text-sm text-stone-600">{{ t('aiComposer.description') }}</span>
        <textarea v-model="draft.description" rows="3" maxlength="1000" class="paper-input w-full rounded-2xl px-4 py-3"></textarea>
      </label>

      <div class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2">
        <DateField v-model="draft.startDate" :label="t('aiComposer.start')" />
        <div class="grid min-w-0 gap-3">
          <div class="flex items-center justify-between">
            <p class="text-sm text-stone-600">{{ t('aiComposer.end') }}</p>
            <label class="flex items-center gap-2 text-sm text-stone-600">
              <input v-model="draft.hasEndDate" type="checkbox" class="rounded border-white/10 bg-white/10" />
              {{ t('aiComposer.isRange') }}
            </label>
          </div>
          <DateField v-if="draft.hasEndDate" v-model="draft.endDate" :label="t('aiComposer.end')" />
          <div v-else class="rounded-2xl border border-dashed border-amber-900/20 bg-amber-50/45 px-4 py-6 text-sm text-stone-500">
            {{ t('aiComposer.pointHint') }}
          </div>
          <label v-if="draft.hasEndDate" class="flex items-center gap-2 text-sm text-stone-600">
            <input v-model="draft.isOngoing" type="checkbox" class="rounded border-white/10 bg-white/10" />
            {{ t('aiComposer.isOngoing') }}
          </label>
        </div>
      </div>

      <div class="paper-subtle rounded-3xl p-4">
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">{{ t('aiComposer.aiChange') }}</span>
          <textarea
            v-model="instruction"
            rows="2"
            maxlength="1000"
            class="paper-input w-full rounded-2xl px-4 py-3"
            :placeholder="t('aiComposer.placeholderInstruction')"
            :disabled="busy"
          ></textarea>
        </label>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button
            class="paper-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            type="button"
            :disabled="busy || instruction.trim().length < 2"
            @click="revise"
          >
            {{ revising ? t('aiComposer.revising') : t('aiComposer.reviseButton') }}
          </button>
          <span class="text-xs text-stone-500">{{ t('aiComposer.schemaHint') }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" type="submit" :disabled="busy">
          {{ saving ? t('aiComposer.saving') : t('aiComposer.adopt') }}
        </button>
        <button class="paper-button rounded-2xl px-4 py-3 text-sm" type="button" :disabled="busy" @click="discard">
          {{ t('aiComposer.discard') }}
        </button>
        <span class="text-xs text-stone-500">{{ t('aiComposer.adoptHint') }}</span>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { numericValue } from '../lib/date';
import { translateApiError } from '../i18n';
import {
  joinCategories,
  splitCategories,
  type AiDraftInput,
  type AiDraftResult,
  type TimelineDate,
} from '../lib/types';
import { useAiStore } from '../stores/ai';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';
import DateField from './DateField.vue';

type EditableDraft = {
  title: string;
  description: string;
  category: string;
  startDate: TimelineDate;
  endDate: TimelineDate;
  hasEndDate: boolean;
  isOngoing: boolean;
};

const emit = defineEmits<{ saved: []; busyChange: [busy: boolean] }>();
const { t } = useI18n();
const store = useAiStore();
const lifeline = useLifelineStore();
const toast = useToastStore();
const prompt = ref('');
const instruction = ref('');
const draft = ref<EditableDraft | null>(null);
const generatedModel = ref('');
const revisionCount = ref(0);
const generating = ref(false);
const revising = ref(false);
const saving = ref(false);
const error = ref('');
const busy = computed(() => generating.value || revising.value || saving.value);
watch(busy, (value) => emit('busyChange', value));

function today(): TimelineDate {
  const now = new Date();
  return { precision: 'day', year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function applyResult(result: AiDraftResult) {
  draft.value = {
    title: result.draft.title,
    description: result.draft.description,
    category: result.draft.category,
    startDate: { ...result.draft.startDate },
    endDate: result.draft.endDate ? { ...result.draft.endDate } : today(),
    hasEndDate: Boolean(result.draft.endDate),
    isOngoing: result.draft.isOngoing,
  };
  generatedModel.value = result.model;
}

async function generate() {
  if (busy.value || prompt.value.trim().length < 3) return;
  error.value = '';
  generating.value = true;
  try {
    applyResult(await store.generateDraft(prompt.value.trim()));
    revisionCount.value = 0;
    instruction.value = '';
    toast.success(t('aiComposer.toastDraftReady'));
  } catch (err) {
    error.value = translateApiError(err) || t('aiComposer.errorCreateFailed');
    toast.error(error.value);
  } finally {
    generating.value = false;
  }
}

async function revise() {
  if (busy.value || !draft.value || instruction.value.trim().length < 2) return;
  error.value = validateDraft();
  if (error.value) return;

  revising.value = true;
  try {
    applyResult(await store.reviseDraft(buildPayload(), instruction.value.trim()));
    revisionCount.value += 1;
    instruction.value = '';
    toast.info(t('aiComposer.toastRevised'));
  } catch (err) {
    error.value = translateApiError(err) || t('aiComposer.errorReviseFailed');
    toast.error(error.value);
  } finally {
    revising.value = false;
  }
}

async function save() {
  if (busy.value || !draft.value) return;
  error.value = validateDraft();
  if (error.value) return;

  saving.value = true;
  try {
    await lifeline.saveEvent({ ...buildPayload() });
    draft.value = null;
    prompt.value = '';
    instruction.value = '';
    revisionCount.value = 0;
    generatedModel.value = '';
    emit('saved');
  } catch (err) {
    error.value = translateApiError(err) || t('aiComposer.errorSaveFailed');
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}

function discard() {
  draft.value = null;
  instruction.value = '';
  revisionCount.value = 0;
  generatedModel.value = '';
  error.value = '';
}

function buildPayload(): AiDraftInput {
  const value = draft.value!;
  return {
    title: value.title.trim(),
    description: value.description.trim(),
    category: joinCategories(splitCategories(value.category)),
    startDate: value.startDate,
    endDate: value.hasEndDate ? value.endDate : null,
    isOngoing: value.hasEndDate ? value.isOngoing : false,
  };
}

function validateDraft() {
  const value = draft.value;
  if (!value) return '';
  if (!value.title.trim()) return t('aiComposer.errorTitle');

  const startError = validateDate(value.startDate, t('aiComposer.start'));
  if (startError) return startError;

  if (value.hasEndDate) {
    const endError = validateDate(value.endDate, t('aiComposer.end'));
    if (endError) return endError;
    if (numericValue(value.startDate, 'start') > numericValue(value.endDate, 'end')) {
      return t('aiComposer.errorEndBeforeStart');
    }
  }
  return '';
}

function validateDate(date: TimelineDate, label: string) {
  const year = Number(date.year);
  if (!Number.isInteger(year) || year < 0 || year > 9999) return t('aiComposer.errorYear', { label });
  if (date.precision === 'year') return '';
  const month = Number(date.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return t('aiComposer.errorMonth', { label });
  if (date.precision === 'day') {
    const day = Number(date.day);
    if (!Number.isInteger(day) || day < 1) return t('aiComposer.errorDay', { label });
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > maxDay) return t('aiComposer.errorDayInvalid', { label });
  }
  return '';
}
</script>

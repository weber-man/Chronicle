<template>
  <section class="paper-panel rounded-[2rem] p-5 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Assistent</p>
        <h2 class="paper-heading mt-1 text-xl font-semibold text-stone-900">Ereignis beschreiben</h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
          Schreibe frei, was passiert ist. Die KI erzeugt daraus einen validierten Entwurf, den du vor dem Speichern prüfen und ändern kannst.
        </p>
      </div>
      <span v-if="store.selectedModel" class="paper-chip max-w-full truncate rounded-full px-3 py-1.5 text-[11px] text-stone-600">
        {{ store.selectedModel }}
      </span>
    </div>

    <form class="mt-4 grid gap-3" @submit.prevent="generate">
      <label class="grid gap-2">
        <span class="sr-only">Ereignis beschreiben</span>
        <textarea
          v-model="prompt"
          rows="4"
          maxlength="4000"
          class="paper-input w-full resize-y rounded-2xl px-4 py-3 leading-6"
          placeholder="Zum Beispiel: Im Sommer 2023 bin ich mit Lea nach Lissabon gezogen. Wir haben in Alfama gewohnt und jeden Morgen Pastéis de Nata gegessen."
          :disabled="busy"
          @keydown.ctrl.enter.prevent="generate"
          @keydown.meta.enter.prevent="generate"
        ></textarea>
      </label>
      <div class="flex flex-wrap items-center gap-3">
        <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" type="submit" :disabled="busy || prompt.trim().length < 3">
          {{ generating ? 'Die KI denkt nach …' : draft ? 'Neuen Vorschlag erzeugen' : 'Vorschlag erzeugen' }}
        </button>
        <span class="text-xs text-stone-500">Strg/⌘ + Enter · Deine Eingabe wird erst jetzt an OpenRouter gesendet.</span>
      </div>
    </form>

    <p v-if="error" class="mt-4 rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950" role="alert" aria-live="assertive">
      {{ error }}
    </p>

    <div v-if="generating && !draft" class="mt-5 grid gap-3" aria-live="polite">
      <div class="h-4 w-2/5 animate-pulse rounded-full bg-amber-900/10"></div>
      <div class="h-24 animate-pulse rounded-2xl bg-amber-900/[0.06]"></div>
      <span class="text-xs text-stone-500">Entwurf wird erstellt und serverseitig validiert …</span>
    </div>

    <form v-if="draft" class="mt-6 grid gap-4 border-t border-amber-900/15 pt-5" novalidate @submit.prevent="save">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900">Vorschau & Prüfung</p>
          <h3 class="paper-heading mt-1 text-lg font-semibold text-stone-900">Stimmt dieser Eintrag?</h3>
        </div>
        <span v-if="revisionCount" class="rounded-full border border-amber-900/15 bg-amber-100/70 px-3 py-1 text-[11px] text-amber-950">
          {{ revisionCount }}× überarbeitet · erneut prüfen
        </span>
        <span v-else-if="generatedModel" class="text-[11px] text-stone-500">Vorschlag von {{ generatedModel }}</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">Titel <span class="text-rose-800" aria-hidden="true">*</span></span>
          <input v-model="draft.title" class="paper-input w-full rounded-2xl px-4 py-3" maxlength="120" required />
        </label>
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">Kategorien</span>
          <input
            v-model="draft.category"
            list="ai-category-suggestions"
            class="paper-input w-full rounded-2xl px-4 py-3"
            placeholder="Reisen, Familie"
            maxlength="200"
          />
          <datalist id="ai-category-suggestions">
            <option v-for="category in lifeline.categories" :key="category.name" :value="category.name" />
          </datalist>
        </label>
      </div>

      <label class="grid min-w-0 gap-2">
        <span class="text-sm text-stone-600">Beschreibung</span>
        <textarea v-model="draft.description" rows="3" maxlength="1000" class="paper-input w-full rounded-2xl px-4 py-3"></textarea>
      </label>

      <div class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2">
        <DateField v-model="draft.startDate" label="Beginn" />
        <div class="grid min-w-0 gap-3">
          <div class="flex items-center justify-between">
            <p class="text-sm text-stone-600">Ende</p>
            <label class="flex items-center gap-2 text-sm text-stone-600">
              <input v-model="draft.hasEndDate" type="checkbox" class="rounded border-white/10 bg-white/10" />
              Zeitspanne
            </label>
          </div>
          <DateField v-if="draft.hasEndDate" v-model="draft.endDate" label="Ende" />
          <div v-else class="rounded-2xl border border-dashed border-amber-900/20 bg-amber-50/45 px-4 py-6 text-sm text-stone-500">
            Einzelner Zeitpunkt. Aktiviere „Zeitspanne“, wenn das Ereignis andauert.
          </div>
          <label v-if="draft.hasEndDate" class="flex items-center gap-2 text-sm text-stone-600">
            <input v-model="draft.isOngoing" type="checkbox" class="rounded border-white/10 bg-white/10" />
            Läuft noch
          </label>
        </div>
      </div>

      <div class="paper-subtle rounded-3xl p-4">
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">KI-Änderung</span>
          <textarea
            v-model="instruction"
            rows="2"
            maxlength="1000"
            class="paper-input w-full rounded-2xl px-4 py-3"
            placeholder="Zum Beispiel: Setze den Beginn auf März 2023 und ergänze die Kategorie Freundschaft."
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
            {{ revising ? 'Überarbeite …' : 'Von KI anpassen lassen' }}
          </button>
          <span class="text-xs text-stone-500">Die Antwort wird erneut gegen das Ereignis-Schema validiert.</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" type="submit" :disabled="busy">
          {{ saving ? 'Speichere …' : 'Eintrag übernehmen' }}
        </button>
        <button class="paper-button rounded-2xl px-4 py-3 text-sm" type="button" :disabled="busy" @click="discard">
          Verwerfen
        </button>
        <span class="text-xs text-stone-500">Beim Übernehmen gelten dieselben Regeln wie im normalen Formular.</span>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { numericValue } from '../lib/date';
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
    toast.success('Vorschlag erstellt. Bitte vor dem Speichern prüfen.');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Es konnte kein Vorschlag erstellt werden.';
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
    toast.info('Der Vorschlag wurde überarbeitet. Bitte erneut prüfen.');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Der Vorschlag konnte nicht überarbeitet werden.';
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Der Eintrag konnte nicht gespeichert werden.';
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
  if (!value.title.trim()) return 'Bitte einen Titel angeben.';

  const startError = validateDate(value.startDate, 'Beginn');
  if (startError) return startError;

  if (value.hasEndDate) {
    const endError = validateDate(value.endDate, 'Ende');
    if (endError) return endError;
    if (numericValue(value.startDate, 'start') > numericValue(value.endDate, 'end')) {
      return 'Das Ende darf nicht vor dem Beginn liegen.';
    }
  }
  return '';
}

function validateDate(date: TimelineDate, label: string) {
  const year = Number(date.year);
  if (!Number.isInteger(year) || year < 0 || year > 9999) return `${label}: Bitte ein Jahr zwischen 0 und 9999 angeben.`;
  if (date.precision === 'year') return '';
  const month = Number(date.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return `${label}: Bitte einen Monat wählen.`;
  if (date.precision === 'day') {
    const day = Number(date.day);
    if (!Number.isInteger(day) || day < 1) return `${label}: Bitte einen Tag wählen.`;
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > maxDay) return `${label}: Diesen Tag gibt es in diesem Monat nicht.`;
  }
  return '';
}
</script>

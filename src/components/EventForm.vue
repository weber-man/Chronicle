<template>
  <section id="event-form" ref="sectionRef" class="paper-panel panel-reveal rounded-[2rem] p-5">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-stone-500">{{ editingEvent ? t('eventForm.modeEdit') : t('eventForm.modeCreate') }}</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">
          {{ editingEvent ? t('eventForm.headingEdit', { title: editingEvent.title }) : t('eventForm.headingCreate') }}
        </h2>
      </div>
      <button v-if="editingEvent" class="text-sm text-stone-500 underline decoration-dotted underline-offset-4" type="button" @click="reset">{{ t('eventForm.cancelEdit') }}</button>
    </div>

    <form class="grid gap-4" novalidate @submit.prevent="submit" @keydown.ctrl.enter.prevent="submit" @keydown.meta.enter.prevent="submit">
      <div class="grid gap-4 lg:grid-cols-2">
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">{{ t('eventForm.title') }} <span class="text-rose-800" aria-hidden="true">*</span></span>
          <input
            v-model="form.title"
            class="paper-input w-full rounded-2xl px-4 py-3"
            :placeholder="t('eventForm.placeholderTitle')"
            maxlength="120"
            autocomplete="off"
            required
          />
          <span v-if="fieldError === 'title'" class="text-xs text-rose-800">{{ t('eventForm.titleRequired') }}</span>
        </label>
        <div class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">{{ t('eventForm.categories') }}</span>
          <div class="paper-input min-h-[3.5rem] rounded-2xl px-3 py-3">
            <div v-if="selectedCategories.length" class="mb-2 flex flex-wrap gap-2">
              <span v-for="category in selectedCategories" :key="category" class="paper-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
                {{ category }}
                <button type="button" class="text-stone-500 hover:text-stone-900" :aria-label="t('eventForm.removeCategory', { category })" @click="removeCategory(category)">×</button>
              </span>
            </div>

            <input
              v-model="categoryInput"
              list="category-suggestions"
              class="w-full min-w-0 bg-transparent px-1 py-1 text-sm text-stone-900 outline-none placeholder:text-stone-500"
              :placeholder="t('eventForm.placeholderCategories')"
              autocomplete="off"
              @keydown="handleCategoryKeydown"
              @blur="commitPendingCategory"
            />
            <datalist id="category-suggestions">
              <option v-for="category in availableSuggestions" :key="category" :value="category" />
            </datalist>
          </div>

          <div v-if="suggestedCategories.length" class="flex flex-wrap gap-2 pt-1">
            <button v-for="category in suggestedCategories" :key="category" type="button" class="paper-chip rounded-full px-3 py-1 text-xs hover:text-stone-900" @click="addCategory(category)">
              + {{ category }}
            </button>
          </div>
        </div>
      </div>

      <label class="grid min-w-0 gap-2">
        <span class="text-sm text-stone-600">{{ t('eventForm.description') }}</span>
        <textarea v-model="form.description" rows="3" maxlength="1000" class="paper-input w-full rounded-2xl px-4 py-3" :placeholder="t('eventForm.placeholderDescription')"></textarea>
      </label>

      <div class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2">
        <DateField v-model="form.startDate" :label="t('eventForm.start')" />
        <div class="grid min-w-0 gap-3">
          <div class="flex items-center justify-between">
            <p class="text-sm text-stone-600">{{ t('eventForm.end') }}</p>
            <label class="flex items-center gap-2 text-sm text-stone-600">
              <input v-model="hasEndDate" type="checkbox" class="rounded border-white/10 bg-white/10" />
              {{ t('eventForm.isRange') }}
            </label>
          </div>
          <DateField v-if="hasEndDate" v-model="form.endDate" :label="t('eventForm.end')" />
          <div v-else class="rounded-2xl border border-dashed border-amber-900/20 bg-amber-50/45 px-4 py-6 text-sm text-stone-500">
            {{ t('eventForm.pointPlaceholder') }}
          </div>
          <label v-if="hasEndDate" class="flex items-center gap-2 text-sm text-stone-600">
            <input v-model="form.isOngoing" type="checkbox" class="rounded border-white/10 bg-white/10" />
            {{ t('eventForm.isOngoing') }}
          </label>
        </div>
      </div>

      <p v-if="error" class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950" role="alert" aria-live="polite">
        {{ error }}
      </p>

      <div class="flex flex-wrap items-center gap-3 pt-2">
        <button class="ink-button interactive-lift rounded-2xl px-5 py-3 font-medium transition hover:scale-[1.01] disabled:opacity-60" type="submit" :disabled="saving">
          {{ saving ? t('eventForm.saving') : editingEvent ? t('eventForm.submitUpdate') : t('eventForm.submitCreate') }}
        </button>
        <span class="text-xs text-stone-500">{{ t('eventForm.shortcutHint') }}</span>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { numericValue } from '../lib/date';
import { translateApiError } from '../i18n';
import { joinCategories, splitCategories, type LifeEvent, type TimelineDate } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';
import DateField from './DateField.vue';

const props = defineProps<{ editingEvent?: LifeEvent | null }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();
const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();
const sectionRef = ref<HTMLElement | null>(null);
const saving = ref(false);
const error = ref('');
const fieldError = ref('');
const hasEndDate = ref(false);
const categoryInput = ref('');
const selectedCategories = ref<string[]>([]);

const today = () => {
  const now = new Date();
  return { precision: 'day' as const, year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};
const blankDate = (): TimelineDate => today();

const form = reactive({
  title: '',
  description: '',
  startDate: blankDate(),
  endDate: blankDate(),
  isOngoing: false,
});

const knownCategories = computed(() => store.categories.map((category) => category.name));
const availableSuggestions = computed(() => knownCategories.value.filter((category) => !selectedCategories.value.some((entry) => entry.localeCompare(category, 'de', { sensitivity: 'accent' }) === 0)));

const suggestedCategories = computed(() => {
  const term = categoryInput.value.trim().toLocaleLowerCase('de');
  const filtered = availableSuggestions.value.filter((category) => !term || category.toLocaleLowerCase('de').includes(term));
  return filtered.slice(0, 8);
});

function loadFromEvent(event?: LifeEvent | null) {
  error.value = '';
  fieldError.value = '';
  if (!event) {
    form.title = '';
    form.description = '';
    selectedCategories.value = [];
    categoryInput.value = '';
    form.startDate = blankDate();
    form.endDate = blankDate();
    form.isOngoing = false;
    hasEndDate.value = false;
    return;
  }

  form.title = event.title;
  form.description = event.description;
  selectedCategories.value = splitCategories(event.category);
  categoryInput.value = '';
  form.startDate = { ...event.startDate };
  form.endDate = event.endDate ? { ...event.endDate } : blankDate();
  form.isOngoing = event.isOngoing;
  hasEndDate.value = Boolean(event.endDate);
}

watch(() => props.editingEvent, loadFromEvent, { immediate: true });

async function submit() {
  if (saving.value) return;
  error.value = '';
  fieldError.value = '';

  if (!form.title.trim()) {
    fieldError.value = 'title';
    error.value = t('eventForm.titleRequired');
    return;
  }

  const dateError = validateDate(form.startDate, t('eventForm.start'));
  if (dateError) {
    error.value = dateError;
    return;
  }

  if (hasEndDate.value) {
    const endError = validateDate(form.endDate, t('eventForm.end'));
    if (endError) {
      error.value = endError;
      return;
    }
    if (numericValue(form.startDate, 'start') > numericValue(form.endDate, 'end')) {
      error.value = t('eventForm.errorEndBeforeStart');
      return;
    }
  }

  saving.value = true;
  commitPendingCategory();
  const payload = {
    title: form.title.trim(),
    description: form.description.trim(),
    category: joinCategories(selectedCategories.value),
    startDate: form.startDate,
    endDate: hasEndDate.value ? form.endDate : null,
    isOngoing: hasEndDate.value ? form.isOngoing : false,
  };

  try {
    await store.saveEvent(payload, props.editingEvent?.id);
    reset();
    emit('saved');
  } catch (err) {
    error.value = translateApiError(err) || t('eventForm.errorSaveFailed');
    toast.error(error.value);
    if (error.value.toLocaleLowerCase().includes('titel') || error.value.toLocaleLowerCase().includes('title')) fieldError.value = 'title';
  } finally {
    saving.value = false;
  }
}

function reset() {
  loadFromEvent(null);
  emit('cancel');
}

function handleCategoryKeydown(event: KeyboardEvent) {
  if (event.key === ',' || event.key === 'Enter') {
    event.preventDefault();
    commitPendingCategory();
    return;
  }

  if (event.key === 'Backspace' && !categoryInput.value && selectedCategories.value.length) {
    selectedCategories.value = selectedCategories.value.slice(0, -1);
  }
}

function commitPendingCategory() {
  if (!categoryInput.value.trim()) return;
  const entries = splitCategories(categoryInput.value);
  for (const entry of entries) addCategory(entry);
  categoryInput.value = '';
}

function addCategory(category: string) {
  const next = joinCategories([...selectedCategories.value, category]);
  selectedCategories.value = splitCategories(next);
}

function removeCategory(category: string) {
  selectedCategories.value = selectedCategories.value.filter((entry) => entry.toLocaleLowerCase('de') !== category.toLocaleLowerCase('de'));
}

function validateDate(date: TimelineDate, label: string) {
  const year = Number(date.year);
  if (!Number.isInteger(year) || year < 0 || year > 9999) return t('eventForm.errorYear', { label });
  if (date.precision === 'year') return '';
  const month = Number(date.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return t('eventForm.errorMonth', { label });
  if (date.precision === 'day') {
    const day = Number(date.day);
    if (!Number.isInteger(day) || day < 1) return t('eventForm.errorDay', { label });
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > maxDay) return t('eventForm.errorDayInvalid', { label });
  }
  return '';
}

defineExpose({ focus: () => sectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
</script>

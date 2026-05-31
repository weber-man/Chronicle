<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-stone-500">Erfassen</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">Neues Ereignis oder Zeitspanne</h2>
      </div>
      <button v-if="editingEvent" class="text-sm text-stone-500 underline decoration-dotted underline-offset-4" @click="reset">Bearbeitung abbrechen</button>
    </div>

    <form class="grid gap-4" @submit.prevent="submit">
      <div class="grid gap-4 lg:grid-cols-2">
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">Titel</span>
          <input v-model="form.title" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="Urlaub Norwegen" />
        </label>
        <label class="grid min-w-0 gap-2">
          <span class="text-sm text-stone-600">Kategorie</span>
          <input v-model="form.category" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="Reisen, Familie, Beruf ..." />
        </label>
      </div>

      <label class="grid min-w-0 gap-2">
        <span class="text-sm text-stone-600">Beschreibung</span>
        <textarea v-model="form.description" rows="3" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="Was war daran wichtig?"></textarea>
      </label>

      <div class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2">
        <DateField v-model="form.startDate" label="Beginn" />
        <div class="grid min-w-0 gap-3">
          <div class="flex items-center justify-between">
            <p class="text-sm text-stone-600">Ende</p>
            <label class="flex items-center gap-2 text-sm text-stone-600">
              <input v-model="hasEndDate" type="checkbox" class="rounded border-white/10 bg-white/10" />
              Zeitspanne
            </label>
          </div>
          <DateField v-if="hasEndDate" v-model="form.endDate" label="Ende" />
          <div v-else class="rounded-2xl border border-dashed border-amber-900/20 bg-amber-50/45 px-4 py-6 text-sm text-stone-500">
            Einzelner Zeitpunkt — perfekt für Geburten, Umzüge oder Abschlüsse.
          </div>
          <label v-if="hasEndDate" class="flex items-center gap-2 text-sm text-stone-600">
            <input v-model="form.isOngoing" type="checkbox" class="rounded border-white/10 bg-white/10" />
            Läuft noch
          </label>
        </div>
      </div>

      <div class="flex flex-wrap gap-3 pt-2">
        <button class="ink-button rounded-2xl px-5 py-3 font-medium transition hover:scale-[1.01]" type="submit">
          {{ editingEvent ? 'Ereignis aktualisieren' : 'Ereignis speichern' }}
        </button>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { LifeEvent, TimelineDate } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import DateField from './DateField.vue';

const props = defineProps<{ editingEvent?: LifeEvent | null }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();
const store = useLifelineStore();

const blankDate = (): TimelineDate => ({ precision: 'day', year: new Date().getFullYear(), month: 1, day: 1 });
const hasEndDate = ref(false);
const form = reactive({
  title: '',
  description: '',
  category: '',
  startDate: blankDate(),
  endDate: blankDate(),
  isOngoing: false,
});

function loadFromEvent(event?: LifeEvent | null) {
  if (!event) {
    form.title = '';
    form.description = '';
    form.category = '';
    form.startDate = blankDate();
    form.endDate = blankDate();
    form.isOngoing = false;
    hasEndDate.value = false;
    return;
  }

  form.title = event.title;
  form.description = event.description;
  form.category = event.category;
  form.startDate = { ...event.startDate };
  form.endDate = event.endDate ? { ...event.endDate } : blankDate();
  form.isOngoing = event.isOngoing;
  hasEndDate.value = Boolean(event.endDate);
}

watch(() => props.editingEvent, loadFromEvent, { immediate: true });

async function submit() {
  if (!form.title.trim()) return;

  const payload = {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim() || 'Alltag',
    startDate: form.startDate,
    endDate: hasEndDate.value ? form.endDate : null,
    isOngoing: hasEndDate.value ? form.isOngoing : false,
  };

  await store.saveEvent(payload, props.editingEvent?.id);
  reset();
  emit('saved');
}

function reset() {
  loadFromEvent(null);
  emit('cancel');
}
</script>

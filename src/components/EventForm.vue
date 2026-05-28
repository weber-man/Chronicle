<template>
  <section class="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-slate-300">Erfassen</p>
        <h2 class="text-xl font-semibold text-white">Neues Ereignis oder Zeitspanne</h2>
      </div>
      <button v-if="editingEvent" class="text-sm text-slate-300 underline decoration-dotted underline-offset-4" @click="reset">Bearbeitung abbrechen</button>
    </div>

    <form class="grid gap-4" @submit.prevent="submit">
      <div class="grid gap-4 lg:grid-cols-2">
        <label class="grid gap-2">
          <span class="text-sm text-slate-300">Titel</span>
          <input v-model="form.title" class="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500" placeholder="Urlaub Norwegen" />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-slate-300">Kategorie</span>
          <input v-model="form.category" class="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500" placeholder="Reisen, Familie, Beruf ..." />
        </label>
      </div>

      <label class="grid gap-2">
        <span class="text-sm text-slate-300">Beschreibung</span>
        <textarea v-model="form.description" rows="3" class="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white placeholder:text-slate-500" placeholder="Was war daran wichtig?"></textarea>
      </label>

      <div class="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/40 p-4 lg:grid-cols-2">
        <DateField v-model="form.startDate" label="Beginn" />
        <div class="grid gap-3">
          <div class="flex items-center justify-between">
            <p class="text-sm text-slate-300">Ende</p>
            <label class="flex items-center gap-2 text-sm text-slate-300">
              <input v-model="hasEndDate" type="checkbox" class="rounded border-white/10 bg-white/10" />
              Zeitspanne
            </label>
          </div>
          <DateField v-if="hasEndDate" v-model="form.endDate" label="Ende" />
          <div v-else class="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Einzelner Zeitpunkt — perfekt für Geburten, Umzüge oder Abschlüsse.
          </div>
          <label v-if="hasEndDate" class="flex items-center gap-2 text-sm text-slate-300">
            <input v-model="form.isOngoing" type="checkbox" class="rounded border-white/10 bg-white/10" />
            Läuft noch
          </label>
        </div>
      </div>

      <label class="grid gap-2 lg:max-w-xs">
        <span class="text-sm text-slate-300">Nutzer</span>
        <select v-model.number="form.userId" class="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white">
          <option disabled value="0">Bitte wählen</option>
          <option v-for="user in store.users" :key="user.id" :value="user.id">{{ user.name }}</option>
        </select>
      </label>

      <div class="flex flex-wrap gap-3 pt-2">
        <button class="rounded-2xl bg-white px-5 py-3 font-medium text-slate-950 transition hover:scale-[1.01]" type="submit">
          {{ editingEvent ? 'Ereignis aktualisieren' : 'Ereignis speichern' }}
        </button>
        <button class="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-medium text-white transition hover:bg-white/10" type="button" @click="fillExample">
          Beispiel einsetzen
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
  userId: 0,
  title: '',
  description: '',
  category: '',
  startDate: blankDate(),
  endDate: blankDate(),
  isOngoing: false,
});

function loadFromEvent(event?: LifeEvent | null) {
  if (!event) {
    form.userId = store.selectedUserId ?? store.users[0]?.id ?? 0;
    form.title = '';
    form.description = '';
    form.category = '';
    form.startDate = blankDate();
    form.endDate = blankDate();
    form.isOngoing = false;
    hasEndDate.value = false;
    return;
  }

  form.userId = event.userId;
  form.title = event.title;
  form.description = event.description;
  form.category = event.category;
  form.startDate = { ...event.startDate };
  form.endDate = event.endDate ? { ...event.endDate } : blankDate();
  form.isOngoing = event.isOngoing;
  hasEndDate.value = Boolean(event.endDate);
}

watch(() => props.editingEvent, loadFromEvent, { immediate: true });
watch(() => store.selectedUserId, (value) => {
  if (!props.editingEvent && value) form.userId = value;
});

async function submit() {
  if (!form.userId || !form.title.trim()) return;

  const payload = {
    userId: form.userId,
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

function fillExample() {
  form.title = 'Urlaub in Norwegen';
  form.category = 'Reisen';
  form.description = 'Roadtrip durch Fjorde, Wandern und viel Ruhe.';
  form.startDate = { precision: 'month', year: 2025, month: 6 };
  form.endDate = { precision: 'month', year: 2025, month: 6 };
  form.isOngoing = false;
  hasEndDate.value = true;
  form.userId = form.userId || store.selectedUserId || store.users[0]?.id || 0;
}

function reset() {
  loadFromEvent(null);
  emit('cancel');
}
</script>

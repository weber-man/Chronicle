<template>
  <div class="space-y-6">
    <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-7">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl">
          <p class="paper-chip mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            <span aria-hidden="true">✦</span> OpenRouter
          </p>
          <h1 class="paper-heading text-2xl font-semibold text-stone-900 sm:text-3xl">KI-Assistent</h1>
          <p class="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
            Beschreibe ein Erlebnis in deinen eigenen Worten. Daraus entsteht ein strukturierter Entwurf mit Titel, Kategorien und Datum.
            Du prüfst ihn, bearbeitest ihn direkt oder lässt ihn von der KI überarbeiten. Erst mit „Eintrag übernehmen“ landet er in deiner Timeline.
          </p>
        </div>
        <span class="ai-orbit hidden h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] border border-amber-900/15 bg-amber-100/55 text-2xl text-amber-900 sm:grid" aria-hidden="true">
          ✦
        </span>
      </div>

      <div v-if="loading" class="mt-7 grid gap-4 lg:grid-cols-3" aria-live="polite">
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <span class="sr-only">KI-Einstellungen werden geladen …</span>
      </div>

      <div v-else-if="loadError" class="mt-7 rounded-3xl border border-rose-900/15 bg-rose-100/60 p-5" role="alert">
        <p class="font-medium text-rose-950">KI-Einstellungen konnten nicht geladen werden.</p>
        <p class="mt-1 text-sm text-rose-900">{{ loadError }}</p>
        <button class="paper-button mt-4 rounded-2xl px-4 py-2 text-sm" type="button" @click="load">Erneut versuchen</button>
      </div>

      <div v-else-if="!store.configured" class="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
        <div class="grid content-start gap-3">
          <div v-for="feature in features" :key="feature.title" class="paper-subtle rounded-3xl p-4">
            <div class="flex items-start gap-3">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-900/10 text-sm text-amber-950" aria-hidden="true">{{ feature.icon }}</span>
              <div>
                <p class="text-sm font-medium text-stone-900">{{ feature.title }}</p>
                <p class="mt-1 text-xs leading-5 text-stone-500">{{ feature.text }}</p>
              </div>
            </div>
          </div>
          <p class="rounded-2xl border border-amber-900/15 bg-amber-50/50 px-4 py-3 text-xs leading-5 text-stone-600">
            Hinweis: Beim Erzeugen werden deine Beschreibung und die vorhandenen Kategorien an OpenRouter übertragen.
            Deine Ereignisse selbst werden nicht automatisch mitgesendet.
          </p>
        </div>

        <AiSettingsPanel />
      </div>

      <div v-else class="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <AiComposer />
        <div class="grid gap-4">
          <AiSettingsPanel />
          <p class="rounded-2xl border border-amber-900/15 bg-amber-50/50 px-4 py-3 text-xs leading-5 text-stone-600">
            Beim Erzeugen und Überarbeiten werden deine Beschreibung und die vorhandenen Kategorien an OpenRouter übertragen.
            Prüfe jeden Vorschlag, bevor du ihn übernimmst.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AiComposer from '../components/AiComposer.vue';
import AiSettingsPanel from '../components/AiSettingsPanel.vue';
import { useAiStore } from '../stores/ai';
import { useToastStore } from '../stores/toast';

const store = useAiStore();
const toast = useToastStore();
const loading = ref(true);
const loadError = ref('');

const features = [
  {
    icon: '✎',
    title: 'Freitext wird Struktur',
    text: 'Titel, Beschreibung, Kategorien und Datum werden als JSON erzeugt und gegen das Ereignis-Schema geprüft.',
  },
  {
    icon: '◉',
    title: 'Vorschau statt Blindflug',
    text: 'Du siehst und bearbeitest den Entwurf, bevor gespeichert wird. Jede KI-Überarbeitung wird erneut validiert.',
  },
  {
    icon: '↺',
    title: 'Iterativ verfeinern',
    text: 'Sage der KI, was sie ändern soll. Danach entscheidest du erneut: übernehmen, weiter bearbeiten oder verwerfen.',
  },
];

onMounted(load);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    await store.ensureLoaded();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unbekannter Fehler.';
    toast.error('KI-Einstellungen konnten nicht geladen werden.');
  } finally {
    loading.value = false;
  }
}
</script>

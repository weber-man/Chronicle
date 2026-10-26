<template>
  <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-6">
    <div>
      <p class="text-sm font-medium text-stone-500">Datenhoheit</p>
      <h2 class="paper-heading text-xl font-semibold text-stone-900">Export, Import & Backup</h2>
      <p class="mt-1 text-sm text-stone-500">Deine Ereignisse bleiben in deiner SQLite-Datei. Hier kannst du sie zusätzlich sichern oder umziehen.</p>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="paper-subtle rounded-3xl p-4">
        <h3 class="font-medium text-stone-900">JSON-Export</h3>
        <p class="mt-1 text-sm text-stone-500">Alle aktiven Ereignisse und der Papierkorb, inklusive Kategorien und Datumsgenauigkeit.</p>
        <button class="ink-button mt-4 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="exporting" @click="exportData">
          {{ exporting ? 'Erstelle Export …' : 'Daten exportieren' }}
        </button>
      </div>

      <div class="paper-subtle rounded-3xl p-4">
        <h3 class="font-medium text-stone-900">JSON-Import</h3>
        <p class="mt-1 text-sm text-stone-500">Fügt Ereignisse hinzu. Bereits vorhandene Einträge mit gleichem Titel und Zeitraum werden übersprungen. Bestehende Daten werden nie ersetzt.</p>
        <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importFile" />
        <button class="paper-button mt-4 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="importing" @click="fileInput?.click()">
          {{ importing ? 'Importiere …' : 'Datei importieren' }}
        </button>
      </div>
    </div>

    <div v-if="store.isAdmin" class="mt-4 rounded-3xl border border-amber-900/15 bg-amber-50/40 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-medium text-stone-900">SQLite-Backup (Administrator)</h3>
          <p class="mt-1 text-sm text-stone-500">Konsistenter Snapshot der kompletten Datenbank. Vor jeder Migration wird zusätzlich automatisch ein Backup im Datenordner angelegt.</p>
        </div>
        <button class="paper-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="backingUp" @click="downloadBackup">
          {{ backingUp ? 'Erstelle Backup …' : 'Backup herunterladen' }}
        </button>
      </div>
    </div>

    <p class="mt-4 text-xs text-stone-500">Import-Hinweis: Es werden nur Ereignisse importiert, die noch nicht vorhanden sind – ideal zum Zusammenführen mehrerer Installationen.</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const store = useLifelineStore();
const toast = useToastStore();
const fileInput = ref<HTMLInputElement | null>(null);
const exporting = ref(false);
const importing = ref(false);
const backingUp = ref(false);

async function exportData() {
  exporting.value = true;
  try {
    await store.exportData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Export fehlgeschlagen.');
  } finally {
    exporting.value = false;
  }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.error('Die Datei ist größer als 5 MB.');
    input.value = '';
    return;
  }

  importing.value = true;
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Die Datei enthält kein gültiges JSON.');
    }

    const events = Array.isArray(parsed)
      ? parsed
      : (parsed as { events?: unknown }).events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('In der Datei wurden keine Ereignisse gefunden.');
    }
    if (!window.confirm(`${events.length} Ereignisse aus „${file.name}“ importieren? Duplikate werden übersprungen.`)) {
      return;
    }

    await store.importData(parsed);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Import fehlgeschlagen.');
  } finally {
    importing.value = false;
    input.value = '';
  }
}

async function downloadBackup() {
  backingUp.value = true;
  try {
    await store.downloadBackup();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Backup fehlgeschlagen.');
  } finally {
    backingUp.value = false;
  }
}
</script>

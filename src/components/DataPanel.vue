<template>
  <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-6">
    <div>
      <p class="text-sm font-medium text-stone-500">{{ t('dataPanel.kicker') }}</p>
      <h2 class="paper-heading text-xl font-semibold text-stone-900">{{ t('dataPanel.heading') }}</h2>
      <p class="mt-1 text-sm text-stone-500">{{ t('dataPanel.subtitle') }}</p>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="paper-subtle rounded-3xl p-4">
        <h3 class="font-medium text-stone-900">{{ t('dataPanel.exportTitle') }}</h3>
        <p class="mt-1 text-sm text-stone-500">{{ t('dataPanel.exportText') }}</p>
        <button class="ink-button mt-4 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="exporting" @click="exportData">
          {{ exporting ? t('dataPanel.exporting') : t('dataPanel.exportButton') }}
        </button>
      </div>

      <div class="paper-subtle rounded-3xl p-4">
        <h3 class="font-medium text-stone-900">{{ t('dataPanel.importTitle') }}</h3>
        <p class="mt-1 text-sm text-stone-500">{{ t('dataPanel.importText') }}</p>
        <input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" @change="importFile" />
        <button class="paper-button mt-4 rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="importing" @click="fileInput?.click()">
          {{ importing ? t('dataPanel.importing') : t('dataPanel.importButton') }}
        </button>
      </div>
    </div>

    <div v-if="store.isAdmin" class="mt-4 rounded-3xl border border-amber-900/15 bg-amber-50/40 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-medium text-stone-900">{{ t('dataPanel.backupTitle') }}</h3>
          <p class="mt-1 text-sm text-stone-500">{{ t('dataPanel.backupText') }}</p>
        </div>
        <button class="paper-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="backingUp" @click="downloadBackup">
          {{ backingUp ? t('dataPanel.backingUp') : t('dataPanel.backupButton') }}
        </button>
      </div>
    </div>

    <p class="mt-4 text-xs text-stone-500">{{ t('dataPanel.importNote') }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
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
    toast.error(translateApiError(error) || t('dataPanel.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.error(t('dataPanel.fileTooLarge'));
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
      throw new Error(t('dataPanel.invalidJson'));
    }

    const events = Array.isArray(parsed)
      ? parsed
      : (parsed as { events?: unknown }).events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error(t('dataPanel.noEvents'));
    }
    if (!window.confirm(t('dataPanel.confirmImport', { count: events.length, fileName: file.name }))) {
      return;
    }

    await store.importData(parsed);
  } catch (error) {
    const message = translateApiError(error) || (error instanceof Error ? error.message : t('dataPanel.importFailed'));
    toast.error(message);
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
    toast.error(translateApiError(error) || t('dataPanel.backupFailed'));
  } finally {
    backingUp.value = false;
  }
}
</script>

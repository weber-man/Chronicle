<template>
  <div class="settings-data-stack">
    <div class="settings-data-banner"><div class="settings-data-art" aria-hidden="true"><FileJson :size="42" :stroke-width="1" /><span>CHRONICLES<br />{{ new Date().getFullYear() }}</span></div><div><span class="settings-eyebrow">{{ t('dataPanel.kicker') }}</span><h3>{{ t('settings.dataBannerTitle') }}</h3><p>{{ t('settings.dataBannerNote') }}</p></div><ArrowUpRight class="settings-data-banner-arrow" :size="28" :stroke-width="1" /></div>
    <section class="settings-surface settings-transfer-list">
      <div class="settings-transfer"><span class="settings-icon-tile"><ArrowDownToLine :size="22" :stroke-width="1.5" /></span><div><h3>{{ t('dataPanel.exportTitle') }}</h3><p>{{ t('dataPanel.exportText') }}</p><span class="settings-format">JSON</span></div><button class="ink-button settings-primary" type="button" :disabled="exporting" @click="exportData">{{ exporting ? t('dataPanel.exporting') : t('dataPanel.exportButton') }}<ArrowDownToLine :size="15" /></button></div>
      <div class="settings-transfer"><span class="settings-icon-tile"><ArrowUpFromLine :size="22" :stroke-width="1.5" /></span><div><h3>{{ t('dataPanel.importTitle') }}</h3><p>{{ t('dataPanel.importText') }}</p><span class="settings-format">JSON · {{ t('settings.maxFileSize') }}</span></div><input ref="fileInput" class="sr-only" type="file" accept="application/json,.json" :aria-label="t('dataPanel.importButton')" @change="importFile" /><button class="paper-button settings-secondary" type="button" :disabled="importing" @click="fileInput?.click()">{{ importing ? t('dataPanel.importing') : t('dataPanel.importButton') }}<ArrowUpFromLine :size="15" /></button></div>
      <div v-if="store.isAdmin" class="settings-transfer"><span class="settings-icon-tile"><Database :size="22" :stroke-width="1.5" /></span><div><h3>{{ t('dataPanel.backupTitle') }}</h3><p>{{ t('dataPanel.backupText') }}</p><span class="settings-format">SQLITE · {{ t('common.admin') }}</span></div><button class="paper-button settings-secondary" type="button" :disabled="backingUp" @click="downloadBackup">{{ backingUp ? t('dataPanel.backingUp') : t('dataPanel.backupButton') }}<ArrowDownToLine :size="15" /></button></div>
    </section>
    <p class="settings-small-note"><ShieldCheck :size="17" />{{ t('dataPanel.importNote') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, Database, FileJson, ShieldCheck } from 'lucide-vue-next';
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

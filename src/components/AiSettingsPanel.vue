<template>
  <section class="settings-ai-panel">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{{ t('aiSettings.kicker') }}</p>
        <h2 class="paper-heading mt-1 text-lg font-semibold text-stone-900">{{ t('aiSettings.heading') }}</h2>
      </div>
      <span
        class="mt-1 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium"
        :class="configured
          ? 'border-emerald-900/20 bg-emerald-100/70 text-emerald-950'
          : 'border-amber-900/20 bg-amber-100/70 text-amber-950'"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="configured ? 'bg-emerald-700' : 'bg-amber-700'"></span>
        {{ configured ? t('aiSettings.connected') : t('aiSettings.notConnected') }}
      </span>
    </div>

    <p v-if="configured" class="mt-3 text-sm leading-6 text-stone-600">
      {{ t('aiSettings.keyStored', { hint: settings?.keyHint ?? '••••' }) }}
      {{ t('aiSettings.keyEncrypted') }}
    </p>
    <p v-else class="mt-3 text-sm leading-6 text-stone-600">
      {{ t('aiSettings.keyDescription') }}
    </p>

    <p
      v-if="settings?.needsReentry"
      class="mt-3 rounded-2xl border border-rose-900/15 bg-rose-100/70 px-3 py-2.5 text-xs leading-5 text-rose-950"
      role="alert"
    >
      {{ t('aiSettings.needsReentry') }}
    </p>

    <div class="mt-4 grid gap-3">
      <label v-if="showKeyForm" class="grid gap-2">
        <span class="text-sm text-stone-600">{{ configured ? t('aiSettings.newApiKey') : t('aiSettings.apiKey') }}</span>
        <div class="relative">
          <input
            v-model="apiKey"
            :type="revealKey ? 'text' : 'password'"
            class="paper-input w-full rounded-2xl px-4 py-3 pr-16 font-mono text-sm"
            :placeholder="t('aiSettings.placeholderKey')"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter.prevent="save"
          />
          <button
            class="absolute inset-y-0 right-2 my-auto rounded-xl px-2.5 py-1 text-xs text-stone-500 hover:text-stone-900"
            type="button"
            @click="revealKey = !revealKey"
          >
            {{ revealKey ? t('aiSettings.hide') : t('aiSettings.show') }}
          </button>
        </div>
        <span class="text-xs text-stone-500">{{ t('aiSettings.keyTransportNote') }}</span>
      </label>

      <div class="grid gap-2">
        <span class="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
          <span>{{ t('aiSettings.model') }}</span>
          <button
            v-if="store.modelsSource === 'fallback' && store.models.length"
            class="text-xs text-amber-900 underline decoration-dotted underline-offset-4"
            type="button"
            :disabled="store.loadingModels"
            @click="refreshModels"
          >
            {{ store.loadingModels ? t('aiSettings.loadingModels') : t('aiSettings.offlineList') }}
          </button>
        </span>
        <ModelPicker
          v-model="model"
          :models="modelOptions"
          :disabled="store.loadingModels && !modelOptions.length"
        />
        <span class="text-xs text-stone-500">
          {{ t('aiSettings.listNote') }}
        </span>
      </div>

      <p v-if="error" class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-3 py-2.5 text-sm text-rose-950" role="alert">
        {{ error }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button class="ink-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-60" type="button" :disabled="saving" @click="save">
          {{ saving ? t('aiSettings.saveSaving') : configured && !showKeyForm ? t('aiSettings.saveModel') : t('aiSettings.saveConnection') }}
        </button>
        <button
          v-if="configured && showKeyForm"
          class="paper-button rounded-2xl px-4 py-2.5 text-sm"
          type="button"
          @click="cancelKeyEdit"
        >
          {{ t('aiSettings.cancel') }}
        </button>
        <button
          v-if="configured && !showKeyForm"
          class="paper-button rounded-2xl px-4 py-2.5 text-sm"
          type="button"
          @click="showKeyForm = true"
        >
          {{ t('aiSettings.replaceKey') }}
        </button>
        <button
          v-if="configured && !confirmRemove"
          class="ml-auto text-xs text-rose-900 underline decoration-dotted underline-offset-4"
          type="button"
          :disabled="removing"
          @click="confirmRemove = true"
        >
          {{ t('aiSettings.removeConnection') }}
        </button>
        <span v-if="confirmRemove" class="ml-auto inline-flex items-center gap-2 text-xs text-rose-950">
          {{ t('aiSettings.reallyRemove') }}
          <button class="paper-button rounded-xl px-2.5 py-1.5" type="button" :disabled="removing" @click="remove">
            {{ removing ? t('aiSettings.removing') : t('common.yes') }}
          </button>
          <button class="rounded-xl px-2 py-1.5 text-stone-600 hover:text-stone-900" type="button" :disabled="removing" @click="confirmRemove = false">
            {{ t('common.no') }}
          </button>
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { translateApiError } from '../i18n';
import { useAiStore } from '../stores/ai';
import { useToastStore } from '../stores/toast';
import ModelPicker from './ModelPicker.vue';

const { t } = useI18n();
const store = useAiStore();
const toast = useToastStore();
const apiKey = ref('');
const model = ref('');
const revealKey = ref(false);
const keyFormOpen = ref(false);
const saving = ref(false);
const removing = ref(false);
const confirmRemove = ref(false);
const error = ref('');

const settings = computed(() => store.settings);
const configured = computed(() => Boolean(settings.value?.configured));
const modelOptions = computed(() => {
  const entries = [...store.models];
  if (model.value && !entries.some((entry) => entry.id === model.value)) {
    entries.unshift({ id: model.value, name: `${model.value} ${t('aiSettings.storedModelSuffix')}`, contextLength: null });
  }
  return entries;
});

watch(
  () => settings.value,
  (value) => {
    if (!value) return;
    model.value = value.model;
    if (!value.configured || value.needsReentry) keyFormOpen.value = true;
  },
  { immediate: true },
);

// A missing or unreadable key always needs the form; otherwise it opens on demand.
const showKeyForm = computed({
  get: () => keyFormOpen.value || !configured.value || Boolean(settings.value?.needsReentry),
  set: (value: boolean) => {
    keyFormOpen.value = value;
  },
});

async function save() {
  error.value = '';
  if (showKeyForm.value && !configured.value && !apiKey.value.trim()) {
    error.value = t('aiSettings.errorKeyRequired');
    return;
  }
  if (apiKey.value.trim() && apiKey.value.trim().length < 20) {
    error.value = t('aiSettings.errorKeyTooShort');
    return;
  }

  saving.value = true;
  try {
    await store.saveSettings({
      ...(apiKey.value.trim() ? { apiKey: apiKey.value.trim() } : {}),
      ...(model.value ? { model: model.value } : {}),
    });
    apiKey.value = '';
    revealKey.value = false;
    keyFormOpen.value = false;
    toast.success(configured.value ? t('aiSettings.toastConfigured') : t('aiSettings.toastSetUp'));
  } catch (err) {
    error.value = translateApiError(err) || t('aiSettings.errorSaveFailed');
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  error.value = '';
  removing.value = true;
  try {
    await store.removeSettings();
    confirmRemove.value = false;
    keyFormOpen.value = false;
    apiKey.value = '';
    toast.info(t('aiSettings.toastRemoved'));
  } catch (err) {
    error.value = translateApiError(err) || t('aiSettings.errorRemoveFailed');
    toast.error(error.value);
  } finally {
    removing.value = false;
  }
}

function cancelKeyEdit() {
  keyFormOpen.value = false;
  apiKey.value = '';
  revealKey.value = false;
}

async function refreshModels() {
  error.value = '';
  try {
    await store.loadModels({ force: true });
  } catch (err) {
    error.value = translateApiError(err) || t('aiSettings.errorModelsFailed');
  }
}
</script>

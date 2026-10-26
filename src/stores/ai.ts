import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../lib/api';
import type { AiDraftInput, AiDraftResult, AiModel, AiModelsResponse, AiSettings } from '../lib/types';

export const useAiStore = defineStore('ai', () => {
  const settings = ref<AiSettings | null>(null);
  const models = ref<AiModel[]>([]);
  const modelsSource = ref<AiModelsResponse['source']>('fallback');
  const loadingSettings = ref(false);
  const loadingModels = ref(false);
  const savingSettings = ref(false);
  const generating = ref(false);
  const revising = ref(false);
  const loaded = ref(false);
  let modelsPromise: Promise<AiModelsResponse> | null = null;
  let modelsGeneration = 0;

  const configured = computed(() => Boolean(settings.value?.configured));
  const selectedModel = computed(() => settings.value?.model ?? '');
  const loading = computed(() => loadingSettings.value || (!loaded.value && Boolean(settings.value) === false));

  async function loadSettings() {
    loadingSettings.value = true;
    try {
      settings.value = await api.getAiSettings();
      loaded.value = true;
      return settings.value;
    } finally {
      loadingSettings.value = false;
    }
  }

  function loadModels(options: { force?: boolean } = {}) {
    if (modelsPromise) return modelsPromise;
    if (!options.force && models.value.length) {
      return Promise.resolve({ models: models.value, source: modelsSource.value });
    }

    const generation = modelsGeneration;
    loadingModels.value = true;
    modelsPromise = (async () => {
      try {
        const data = await api.getAiModels();
        if (generation === modelsGeneration) {
          models.value = data.models;
          modelsSource.value = data.source;
        }
        return data;
      } finally {
        if (generation === modelsGeneration) {
          loadingModels.value = false;
          modelsPromise = null;
        }
      }
    })();
    return modelsPromise;
  }

  function prefetchModels() {
    if (models.value.length || modelsPromise) return;
    void loadModels().catch(() => {
      // Prefetching is best effort; the assistant page retries when opened.
    });
  }

  async function ensureLoaded() {
    if (loaded.value) {
      if (!models.value.length && !loadingModels.value) await loadModels();
      return;
    }
    await Promise.all([loadSettings(), loadModels()]);
  }

  async function saveSettings(payload: { apiKey?: string; model?: string }) {
    savingSettings.value = true;
    try {
      settings.value = await api.saveAiSettings(payload);
      loaded.value = true;
      return settings.value;
    } finally {
      savingSettings.value = false;
    }
  }

  async function removeSettings() {
    await api.deleteAiSettings();
    settings.value = await api.getAiSettings();
  }

  async function generateDraft(prompt: string): Promise<AiDraftResult> {
    generating.value = true;
    try {
      return await api.generateAiDraft(prompt);
    } finally {
      generating.value = false;
    }
  }

  async function reviseDraft(draft: AiDraftInput, instruction: string): Promise<AiDraftResult> {
    revising.value = true;
    try {
      return await api.reviseAiDraft(draft, instruction);
    } finally {
      revising.value = false;
    }
  }

  function reset() {
    modelsGeneration += 1;
    modelsPromise = null;
    settings.value = null;
    models.value = [];
    modelsSource.value = 'fallback';
    loaded.value = false;
    loadingSettings.value = false;
    loadingModels.value = false;
    savingSettings.value = false;
    generating.value = false;
    revising.value = false;
  }

  return {
    settings,
    models,
    modelsSource,
    loadingSettings,
    loadingModels,
    savingSettings,
    generating,
    revising,
    loaded,
    configured,
    selectedModel,
    loading,
    loadSettings,
    loadModels,
    prefetchModels,
    ensureLoaded,
    saveSettings,
    removeSettings,
    generateDraft,
    reviseDraft,
    reset,
  };
});

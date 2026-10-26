<template>
  <section class="mx-auto max-w-md paper-panel rounded-[2rem] p-6">
    <div class="mb-6 text-center">
      <p class="paper-chip mx-auto mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">Chronicles</p>
      <h1 class="paper-heading text-3xl font-semibold text-stone-900">{{ heading }}</h1>
      <p class="mt-2 text-sm text-stone-500">{{ subline }}</p>
    </div>

    <SegmentedTabs class="mb-4" :items="tabItems" :model-value="activeTab" @update:model-value="switchMode($event as Mode)" />

    <form class="grid gap-4" @submit.prevent="submit">
      <label v-if="mode === 'register'" class="grid gap-2">
        <span class="text-sm text-stone-600">Name</span>
        <input v-model="form.name" class="paper-input rounded-2xl px-4 py-3" placeholder="Manuel" maxlength="60" autocomplete="name" required />
      </label>

      <label v-if="mode === 'register'" class="grid gap-2">
        <span class="text-sm text-stone-600">Farbe</span>
        <input v-model="form.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
      </label>

      <label v-if="mode !== 'reset-confirm'" class="grid gap-2">
        <span class="text-sm text-stone-600">E-Mail</span>
        <input v-model="form.email" type="email" class="paper-input rounded-2xl px-4 py-3" placeholder="du@example.com" autocomplete="email" required />
      </label>

      <label v-if="mode === 'reset-confirm'" class="grid gap-2">
        <span class="text-sm text-stone-600">Reset-Token</span>
        <input v-model="form.resetToken" class="paper-input rounded-2xl px-4 py-3" placeholder="Token aus deiner E-Mail" autocomplete="off" required />
      </label>

      <label v-if="mode !== 'reset-request'" class="grid gap-2">
        <span class="text-sm text-stone-600">Passwort</span>
        <input
          v-model="form.password"
          type="password"
          class="paper-input rounded-2xl px-4 py-3"
          :placeholder="passwordPlaceholder"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          :minlength="mode === 'login' ? 8 : 12"
          required
        />
      </label>

      <label v-if="mode === 'register' || mode === 'reset-confirm'" class="grid gap-2">
        <span class="text-sm text-stone-600">Passwort wiederholen</span>
        <input v-model="form.passwordConfirm" type="password" class="paper-input rounded-2xl px-4 py-3" placeholder="Neues Passwort wiederholen" autocomplete="new-password" required />
      </label>

      <p v-if="message" class="rounded-2xl border border-emerald-900/15 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-950" role="status" aria-live="polite">{{ message }}</p>
      <p v-if="error" class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950" role="alert" aria-live="assertive">{{ error }}</p>

      <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" :disabled="submitting" type="submit">
        {{ submitting ? 'Bitte warten …' : submitLabel }}
      </button>
    </form>

    <div class="mt-4 flex justify-between text-xs text-stone-500">
      <button v-if="mode === 'login'" class="hover:text-stone-800" type="button" @click="switchMode('reset-request')">Passwort vergessen?</button>
      <button v-else-if="mode === 'reset-request'" class="hover:text-stone-800" type="button" @click="switchMode('reset-confirm')">Ich habe schon einen Token</button>
      <button v-else-if="mode === 'reset-confirm'" class="hover:text-stone-800" type="button" @click="switchMode('login')">Zurück zum Login</button>
      <span v-else></span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import SegmentedTabs from '../components/SegmentedTabs.vue';
import { useLifelineStore } from '../stores/lifeline';

type Mode = 'login' | 'register' | 'reset-request' | 'reset-confirm';

const store = useLifelineStore();
const router = useRouter();
const mode = ref<Mode>('login');
const submitting = ref(false);
const error = ref('');
const message = ref('');
const form = reactive({
  name: '',
  color: '#7c3aed',
  email: '',
  password: '',
  passwordConfirm: '',
  resetToken: '',
});

const tabItems = computed(() => {
  const items = [{ value: 'login', label: 'Login' }];
  if (store.allowRegistration) items.push({ value: 'register', label: 'Registrieren' });
  items.push({ value: 'reset-request', label: 'Reset' });
  return items;
});

const activeTab = computed(() => (mode.value.startsWith('reset') ? 'reset-request' : mode.value));

const heading = computed(() => {
  switch (mode.value) {
    case 'register':
      return 'Account erstellen';
    case 'reset-request':
      return 'Passwort zurücksetzen';
    case 'reset-confirm':
      return 'Neues Passwort setzen';
    default:
      return 'Anmelden';
  }
});

const subline = computed(() => {
  switch (mode.value) {
    case 'reset-request':
      return 'Falls ein Konto existiert, starten wir einen sicheren Reset. Der Token wird nicht im Browser angezeigt.';
    case 'reset-confirm':
      return 'Token einfügen und ein neues starkes Passwort setzen.';
    case 'register':
      return 'Sicherer Zugriff auf deine persönliche Timeline.';
    default:
      return 'Sicherer Zugriff auf deine persönliche Timeline.';
  }
});

const submitLabel = computed(() => {
  switch (mode.value) {
    case 'register':
      return 'Registrieren';
    case 'reset-request':
      return 'Reset anfordern';
    case 'reset-confirm':
      return 'Passwort erneuern';
    default:
      return 'Einloggen';
  }
});

const passwordPlaceholder = computed(() => {
  switch (mode.value) {
    case 'register':
      return 'Mindestens 12 Zeichen';
    case 'reset-confirm':
      return 'Neues Passwort';
    default:
      return 'Dein Passwort';
  }
});

function clearFeedback() {
  error.value = '';
  message.value = '';
}

function switchMode(nextMode: Mode) {
  if (nextMode === 'register' && !store.allowRegistration) {
    mode.value = 'login';
    return;
  }
  mode.value = nextMode;
  clearFeedback();
}

async function submit() {
  clearFeedback();
  if ((mode.value === 'register' || mode.value === 'reset-confirm') && form.password !== form.passwordConfirm) {
    error.value = 'Die neuen Passwörter stimmen nicht überein.';
    return;
  }
  if (mode.value === 'register' && form.password.length < 12) {
    error.value = 'Das Passwort braucht mindestens 12 Zeichen.';
    return;
  }

  submitting.value = true;
  try {
    if (mode.value === 'login') {
      await store.login({ email: form.email.trim(), password: form.password });
      await router.replace({ name: 'dashboard' });
      return;
    }

    if (mode.value === 'register') {
      await store.register({ name: form.name.trim(), color: form.color, email: form.email.trim(), password: form.password });
      await router.replace({ name: 'dashboard' });
      return;
    }

    if (mode.value === 'reset-request') {
      const result = await store.requestPasswordReset({ email: form.email.trim() });
      message.value = result.message;
      return;
    }

    if (form.password !== form.passwordConfirm) {
      throw new Error('Die neuen Passwörter stimmen nicht überein.');
    }

    const result = await store.confirmPasswordReset({ token: form.resetToken.trim(), password: form.password });
    message.value = result.message;
    form.password = '';
    form.passwordConfirm = '';
    form.resetToken = '';
    mode.value = 'login';
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Aktion fehlgeschlagen.';
  } finally {
    submitting.value = false;
  }
}
</script>

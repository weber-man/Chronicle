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
        <span class="text-sm text-stone-600">{{ t('login.labelName') }}</span>
        <input v-model="form.name" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('login.phName')" maxlength="60" autocomplete="name" required />
      </label>

      <label v-if="mode === 'register'" class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('login.labelColor') }}</span>
        <input v-model="form.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
      </label>

      <label v-if="mode !== 'reset-confirm'" class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('login.labelEmail') }}</span>
        <input v-model="form.email" type="email" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('login.phEmail')" autocomplete="email" required />
      </label>

      <label v-if="mode === 'reset-confirm'" class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('login.labelResetToken') }}</span>
        <input v-model="form.resetToken" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('login.phToken')" autocomplete="off" required />
      </label>

      <label v-if="mode !== 'reset-request'" class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('login.labelPassword') }}</span>
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
        <span class="text-sm text-stone-600">{{ t('login.labelPasswordConfirm') }}</span>
        <input v-model="form.passwordConfirm" type="password" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('login.phPasswordConfirm')" autocomplete="new-password" required />
      </label>

      <p v-if="message" class="rounded-2xl border border-emerald-900/15 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-950" role="status" aria-live="polite">{{ message }}</p>
      <p v-if="error" class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950" role="alert" aria-live="assertive">{{ error }}</p>

      <button class="ink-button rounded-2xl px-5 py-3 font-medium disabled:opacity-60" :disabled="submitting" type="submit">
        {{ submitting ? t('login.waiting') : submitLabel }}
      </button>
    </form>

    <div class="mt-4 flex justify-between text-xs text-stone-500">
      <button v-if="mode === 'login'" class="hover:text-stone-800" type="button" @click="switchMode('reset-request')">{{ t('login.forgotPassword') }}</button>
      <button v-else-if="mode === 'reset-request'" class="hover:text-stone-800" type="button" @click="switchMode('reset-confirm')">{{ t('login.haveToken') }}</button>
      <button v-else-if="mode === 'reset-confirm'" class="hover:text-stone-800" type="button" @click="switchMode('login')">{{ t('login.backToLogin') }}</button>
      <span v-else></span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SegmentedTabs from '../components/SegmentedTabs.vue';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';

type Mode = 'login' | 'register' | 'reset-request' | 'reset-confirm';

const { t } = useI18n();
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
  const items = [{ value: 'login', label: t('login.tabLogin') }];
  if (store.allowRegistration) items.push({ value: 'register', label: t('login.tabRegister') });
  items.push({ value: 'reset-request', label: t('login.tabReset') });
  return items;
});

const activeTab = computed(() => (mode.value.startsWith('reset') ? 'reset-request' : mode.value));

const heading = computed(() => {
  switch (mode.value) {
    case 'register': return t('login.headingRegister');
    case 'reset-request': return t('login.headingResetRequest');
    case 'reset-confirm': return t('login.headingResetConfirm');
    default: return t('login.headingLogin');
  }
});

const subline = computed(() => {
  switch (mode.value) {
    case 'reset-request': return t('login.sublineRequest');
    case 'reset-confirm': return t('login.sublineConfirm');
    default: return t('login.sublineAuth');
  }
});

const submitLabel = computed(() => {
  switch (mode.value) {
    case 'register': return t('login.submitRegister');
    case 'reset-request': return t('login.submitResetRequest');
    case 'reset-confirm': return t('login.submitResetConfirm');
    default: return t('login.submitLogin');
  }
});

const passwordPlaceholder = computed(() => {
  switch (mode.value) {
    case 'register': return t('login.phPasswordRegister');
    case 'reset-confirm': return t('login.phPasswordReset');
    default: return t('login.phPasswordLogin');
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
    error.value = t('login.errorPasswordsDiffer');
    return;
  }
  if (mode.value === 'register' && form.password.length < 12) {
    error.value = t('login.errorPasswordTooShort');
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
      await store.requestPasswordReset({ email: form.email.trim() });
      message.value = t('login.resetRequested');
      return;
    }

    if (form.password !== form.passwordConfirm) {
      throw new Error('Passwords do not match.');
    }

    await store.confirmPasswordReset({ token: form.resetToken.trim(), password: form.password });
    message.value = t('login.resetConfirmed');
    form.password = '';
    form.passwordConfirm = '';
    form.resetToken = '';
    mode.value = 'login';
  } catch (err) {
    error.value = translateApiError(err) || t('login.actionFailed');
  } finally {
    submitting.value = false;
  }
}
</script>

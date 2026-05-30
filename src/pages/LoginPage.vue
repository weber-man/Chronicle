<template>
  <section class="mx-auto max-w-md paper-panel rounded-[2rem] p-6">
    <div class="mb-6 text-center">
      <p class="paper-chip mx-auto mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">Lifeline</p>
      <h1 class="paper-heading text-3xl font-semibold text-stone-900">Anmelden</h1>
      <p class="mt-2 text-sm text-stone-500">Sicherer Zugriff auf deine persönliche Timeline.</p>
    </div>

    <div class="mb-4 flex rounded-2xl paper-nav p-1">
      <button class="flex-1 rounded-xl px-4 py-2 text-sm font-medium" :class="mode === 'login' ? 'paper-nav-link router-link-active' : 'paper-nav-link'" @click="mode = 'login'">Login</button>
      <button class="flex-1 rounded-xl px-4 py-2 text-sm font-medium" :class="mode === 'register' ? 'paper-nav-link router-link-active' : 'paper-nav-link'" @click="mode = 'register'">Account erstellen</button>
    </div>

    <form class="grid gap-4" @submit.prevent="submit">
      <label v-if="mode === 'register'" class="grid gap-2">
        <span class="text-sm text-stone-600">Name</span>
        <input v-model="form.name" class="paper-input rounded-2xl px-4 py-3" placeholder="Manuel" />
      </label>

      <label v-if="mode === 'register'" class="grid gap-2">
        <span class="text-sm text-stone-600">Farbe</span>
        <input v-model="form.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
      </label>

      <label class="grid gap-2">
        <span class="text-sm text-stone-600">E-Mail</span>
        <input v-model="form.email" type="email" class="paper-input rounded-2xl px-4 py-3" placeholder="du@example.com" />
      </label>

      <label class="grid gap-2">
        <span class="text-sm text-stone-600">Passwort</span>
        <input v-model="form.password" type="password" class="paper-input rounded-2xl px-4 py-3" placeholder="Mindestens 12 Zeichen" />
      </label>

      <p v-if="error" class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-sm text-rose-950">{{ error }}</p>

      <button class="ink-button rounded-2xl px-5 py-3 font-medium" :disabled="submitting" type="submit">
        {{ submitting ? 'Bitte warten …' : mode === 'login' ? 'Einloggen' : 'Registrieren' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();
const router = useRouter();
const mode = ref<'login' | 'register'>('login');
const submitting = ref(false);
const error = ref('');
const form = reactive({
  name: '',
  color: '#7c3aed',
  email: '',
  password: '',
});

async function submit() {
  error.value = '';
  submitting.value = true;
  try {
    if (mode.value === 'login') {
      await store.login({ email: form.email.trim(), password: form.password });
    } else {
      await store.register({ name: form.name.trim(), color: form.color, email: form.email.trim(), password: form.password });
    }
    await router.replace({ name: 'dashboard' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.';
  } finally {
    submitting.value = false;
  }
}
</script>

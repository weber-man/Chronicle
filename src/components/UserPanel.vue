<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">Dein Account</h2>
        <p class="mt-1 text-sm text-stone-500">Nur deine eigenen Daten sind sichtbar und bearbeitbar.</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="h-4 w-4 rounded-full border border-amber-900/15" :style="{ backgroundColor: store.me?.color ?? '#7c3aed' }"></span>
        <p class="text-sm font-medium text-stone-700">{{ store.me?.name }}</p>
      </div>
    </div>

    <form class="paper-subtle mt-5 grid gap-4 rounded-3xl p-4 lg:grid-cols-2" @submit.prevent="saveAccount">
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">Name</span>
        <input v-model="account.name" class="paper-input rounded-2xl px-4 py-3" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">Farbe</span>
        <input v-model="account.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">Aktuelles Passwort</span>
        <input v-model="account.currentPassword" type="password" class="paper-input rounded-2xl px-4 py-3" placeholder="Nur für Passwortwechsel nötig" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">Neues Passwort</span>
        <input v-model="account.newPassword" type="password" class="paper-input rounded-2xl px-4 py-3" placeholder="Mindestens 12 Zeichen" />
      </label>
      <div class="lg:col-span-2 flex flex-wrap gap-3">
        <button class="ink-button rounded-2xl px-4 py-3 font-medium" type="submit">Account speichern</button>
        <button class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-rose-950" type="button" @click="removeAccount">Account löschen</button>
      </div>
    </form>

    <div v-if="store.isAdmin" class="mt-6 space-y-4">
      <div>
        <h3 class="paper-heading text-lg font-semibold text-stone-900">Benutzerverwaltung</h3>
        <p class="mt-1 text-sm text-stone-500">Als Administrator kannst du weitere Accounts anlegen und Rollen anpassen.</p>
      </div>

      <form class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2" @submit.prevent="createUser">
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">Name</span>
          <input v-model="newUser.name" class="paper-input rounded-2xl px-4 py-3" />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">Farbe</span>
          <input v-model="newUser.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">E-Mail</span>
          <input v-model="newUser.email" type="email" class="paper-input rounded-2xl px-4 py-3" />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">Passwort</span>
          <input v-model="newUser.password" type="password" class="paper-input rounded-2xl px-4 py-3" />
        </label>
        <label class="grid gap-2 lg:max-w-xs">
          <span class="text-sm text-stone-600">Rolle</span>
          <select v-model="newUser.role" class="paper-input rounded-2xl px-4 py-3">
            <option value="user">Benutzer</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <div class="lg:col-span-2">
          <button class="ink-button rounded-2xl px-4 py-3 font-medium" type="submit">Benutzer anlegen</button>
        </div>
      </form>

      <div class="space-y-2">
        <div v-for="user in store.adminUsers" :key="user.id" class="paper-subtle flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <p class="font-medium text-stone-900">{{ user.name }} <span class="text-xs text-stone-500">({{ user.email }})</span></p>
            <p class="text-xs text-stone-500">{{ user.role === 'admin' ? 'Administrator' : 'Benutzer' }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: user.color }"></span>
            <select class="paper-input rounded-xl px-3 py-2 text-sm" :value="user.role" @change="changeRole(user.id, ($event.target as HTMLSelectElement).value)">
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();
const router = useRouter();

const account = reactive({
  name: '',
  color: '#7c3aed',
  currentPassword: '',
  newPassword: '',
});

const newUser = reactive({
  name: '',
  color: '#38bdf8',
  email: '',
  password: '',
  role: 'user' as 'admin' | 'user',
});

watch(
  () => store.me,
  (value) => {
    account.name = value?.name ?? '';
    account.color = value?.color ?? '#7c3aed';
    account.currentPassword = '';
    account.newPassword = '';
  },
  { immediate: true },
);

async function saveAccount() {
  await store.updateAccount({
    name: account.name.trim(),
    color: account.color,
    currentPassword: account.currentPassword || undefined,
    newPassword: account.newPassword || undefined,
  });
  account.currentPassword = '';
  account.newPassword = '';
}

async function removeAccount() {
  const password = window.prompt('Bitte bestätige dein Passwort, um den Account zu löschen.');
  if (!password) return;
  await store.deleteAccount(password);
  await router.replace({ name: 'login' });
}

async function createUser() {
  await store.createUser({
    name: newUser.name.trim(),
    color: newUser.color,
    email: newUser.email.trim(),
    password: newUser.password,
    role: newUser.role,
  });
  newUser.name = '';
  newUser.color = '#38bdf8';
  newUser.email = '';
  newUser.password = '';
  newUser.role = 'user';
}

async function changeRole(userId: number, role: string) {
  await store.updateUser(userId, { role });
}
</script>

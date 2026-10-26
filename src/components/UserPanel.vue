<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">{{ t('userPanel.heading') }}</h2>
        <p class="mt-1 text-sm text-stone-500">{{ t('userPanel.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="h-4 w-4 rounded-full border border-amber-900/15" :style="{ backgroundColor: store.me?.color ?? '#7c3aed' }"></span>
        <p class="text-sm font-medium text-stone-700">{{ store.me?.name }}</p>
      </div>
    </div>

    <form class="paper-subtle mt-5 grid gap-4 rounded-3xl p-4 lg:grid-cols-2" @submit.prevent="saveAccount">
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('userPanel.name') }}</span>
        <input v-model="account.name" class="paper-input rounded-2xl px-4 py-3" maxlength="60" autocomplete="name" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('userPanel.color') }}</span>
        <input v-model="account.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('userPanel.currentPassword') }}</span>
        <input v-model="account.currentPassword" type="password" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('userPanel.placeholderCurrentPassword')" autocomplete="current-password" />
      </label>
      <label class="grid gap-2">
        <span class="text-sm text-stone-600">{{ t('userPanel.newPassword') }}</span>
        <input v-model="account.newPassword" type="password" class="paper-input rounded-2xl px-4 py-3" :placeholder="t('userPanel.placeholderNewPassword')" autocomplete="new-password" />
      </label>
      <div class="flex flex-wrap gap-3 lg:col-span-2">
        <button class="ink-button rounded-2xl px-4 py-3 font-medium disabled:opacity-60" type="submit" :disabled="savingAccount">
          {{ savingAccount ? t('common.saving') : t('userPanel.saveAccount') }}
        </button>
        <button class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-3 text-rose-950 disabled:opacity-50" type="button" :disabled="deletingAccount" @click="removeAccount">
          {{ deletingAccount ? t('common.deleting') : t('userPanel.deleteAccount') }}
        </button>
        <span class="self-center text-xs text-stone-500">{{ t('userPanel.passwordChangeNote') }}</span>
      </div>
    </form>

    <div v-if="store.isAdmin" class="mt-6 space-y-4">
      <div>
        <h3 class="paper-heading text-lg font-semibold text-stone-900">{{ t('userPanel.adminHeading') }}</h3>
        <p class="mt-1 text-sm text-stone-500">{{ t('userPanel.adminSubtitle') }}</p>
      </div>

      <form class="paper-subtle grid gap-4 rounded-3xl p-4 lg:grid-cols-2" @submit.prevent="createUser">
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">{{ t('userPanel.name') }}</span>
          <input v-model="newUser.name" class="paper-input rounded-2xl px-4 py-3" maxlength="60" required />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">{{ t('userPanel.color') }}</span>
          <input v-model="newUser.color" type="color" class="paper-input h-12 rounded-2xl p-2" />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">{{ t('userPanel.email') }}</span>
          <input v-model="newUser.email" type="email" class="paper-input rounded-2xl px-4 py-3" autocomplete="off" required />
        </label>
        <label class="grid gap-2">
          <span class="text-sm text-stone-600">{{ t('userPanel.password') }}</span>
          <input v-model="newUser.password" type="password" class="paper-input rounded-2xl px-4 py-3" minlength="12" autocomplete="new-password" :placeholder="t('userPanel.placeholderNewPassword')" required />
        </label>
        <label class="grid gap-2 lg:max-w-xs">
          <span class="text-sm text-stone-600">{{ t('userPanel.role') }}</span>
          <select v-model="newUser.role" class="paper-input rounded-2xl px-4 py-3">
            <option value="user">{{ t('userPanel.roleUser') }}</option>
            <option value="admin">{{ t('userPanel.roleAdmin') }}</option>
          </select>
        </label>
        <div class="lg:col-span-2">
          <button class="ink-button rounded-2xl px-4 py-3 font-medium disabled:opacity-60" type="submit" :disabled="creatingUser">
            {{ creatingUser ? t('userPanel.creating') : t('userPanel.createUser') }}
          </button>
        </div>
      </form>

      <div class="space-y-2">
        <div v-for="user in store.adminUsers" :key="user.id" class="paper-subtle flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <p class="font-medium text-stone-900">{{ user.name }} <span class="text-xs text-stone-500">({{ user.email }})</span></p>
            <p class="text-xs text-stone-500">{{ user.role === 'admin' ? t('userPanel.roleAdmin') : t('userPanel.roleUser') }}<span v-if="user.id === store.me?.id">{{ t('userPanel.thisIsYou') }}</span></p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: user.color }"></span>
            <select class="paper-input rounded-xl px-3 py-2 text-sm" :value="user.role" :disabled="user.id === store.me?.id" @change="changeRole(user.id, ($event.target as HTMLSelectElement).value)">
              <option value="user">{{ t('userPanel.roleUser') }}</option>
              <option value="admin">{{ t('userPanel.roleAdmin') }}</option>
            </select>
            <button class="paper-button rounded-xl px-3 py-2 text-xs" type="button" @click="resetUserPassword(user.id, user.name)">{{ t('userPanel.setPassword') }}</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();
const router = useRouter();
const savingAccount = ref(false);
const deletingAccount = ref(false);
const creatingUser = ref(false);

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
  if (account.newPassword && account.newPassword.length < 12) {
    toast.error(t('userPanel.errorPasswordTooShort'));
    return;
  }
  savingAccount.value = true;
  try {
    await store.updateAccount({
      name: account.name.trim(),
      color: account.color,
      currentPassword: account.currentPassword || undefined,
      newPassword: account.newPassword || undefined,
    });
    account.currentPassword = '';
    account.newPassword = '';
  } catch (error) {
    toast.error(translateApiError(error) || t('userPanel.errorAccountSave'));
  } finally {
    savingAccount.value = false;
  }
}

async function removeAccount() {
  if (!window.confirm(t('userPanel.confirmDeleteAccount'))) return;
  const password = window.prompt(t('userPanel.promptPassword'));
  if (!password) return;
  deletingAccount.value = true;
  try {
    await store.deleteAccount(password);
    await router.replace({ name: 'login' });
  } catch (error) {
    toast.error(translateApiError(error) || t('userPanel.errorAccountDelete'));
  } finally {
    deletingAccount.value = false;
  }
}

async function createUser() {
  if (!newUser.name.trim() || !newUser.email.trim()) {
    toast.error(t('userPanel.errorRequiredFields'));
    return;
  }
  if (newUser.password.length < 12) {
    toast.error(t('userPanel.errorPasswordTooShort'));
    return;
  }
  creatingUser.value = true;
  try {
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
  } catch (error) {
    toast.error(translateApiError(error) || t('userPanel.errorUserCreate'));
  } finally {
    creatingUser.value = false;
  }
}

async function changeRole(userId: number, role: string) {
  try {
    await store.updateUser(userId, { role });
    toast.success(t('userPanel.toastRoleUpdated'));
  } catch (error) {
    toast.error(translateApiError(error) || t('userPanel.errorRoleChange'));
    await store.loadAdminUsers().catch(() => undefined);
  }
}

async function resetUserPassword(userId: number, name: string) {
  const password = window.prompt(t('userPanel.promptNewPassword', { name }));
  if (!password) return;
  if (password.length < 12) {
    toast.error(t('userPanel.errorPasswordTooShort'));
    return;
  }
  try {
    await store.updateUser(userId, { password });
    toast.success(t('userPanel.toastPasswordSet', { name }));
  } catch (error) {
    toast.error(translateApiError(error) || t('userPanel.errorPasswordSet'));
  }
}
</script>

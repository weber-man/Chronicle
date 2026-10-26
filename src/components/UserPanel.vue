<template>
  <div>
    <div v-if="section === 'profile'" class="settings-profile-grid">
      <form class="settings-surface settings-profile-form" @submit.prevent="saveAccount">
        <div class="settings-profile-preview">
          <span class="settings-profile-avatar" :style="{ backgroundColor: account.color }">{{ account.name.trim().charAt(0).toUpperCase() || 'C' }}</span>
          <div><span class="settings-eyebrow">{{ t('settings.thisIsYou') }}</span><h3>{{ account.name || store.me?.name }}</h3><p>{{ store.me?.email }}</p></div>
          <span class="settings-preview-spark" aria-hidden="true">✳</span>
        </div>
        <div class="settings-form-body">
          <div class="settings-field"><label for="profile-name">{{ t('userPanel.name') }}</label><input id="profile-name" v-model="account.name" class="paper-input" maxlength="60" autocomplete="name" aria-describedby="profile-name-hint" required /><small id="profile-name-hint">{{ t('settings.nameHint') }}</small></div>
          <div class="settings-field"><span>{{ t('userPanel.email') }}</span><div class="settings-readonly"><Mail :size="16" /><span>{{ store.me?.email }}</span><LockKeyhole :size="13" /></div></div>
          <fieldset class="settings-colors"><legend>{{ t('settings.signatureColor') }}</legend><p>{{ t('settings.colorHint') }}</p><div class="settings-swatch-row">
            <button v-for="color in colors" :key="color.value" type="button" class="settings-swatch" :style="{ backgroundColor: color.value }" :aria-label="t(`settings.colors.${color.name}`)" :aria-pressed="account.color.toLowerCase() === color.value" @click="account.color = color.value"><Check v-if="account.color.toLowerCase() === color.value" :size="17" /></button>
            <label class="settings-custom-color" :title="t('settings.customColor')"><Palette :size="18" /><input v-model="account.color" type="color" :aria-label="t('settings.customColor')" /></label>
            <span class="settings-color-code">{{ account.color }}</span>
          </div></fieldset>
        </div>
        <div class="settings-savebar"><span class="settings-save-status" :class="{ 'is-dirty': profileDirty }"><span></span>{{ profileDirty ? t('settings.unsaved') : t('settings.upToDate') }}</span><button class="ink-button settings-primary" type="submit" :disabled="savingAccount || !profileDirty"><Check :size="16" />{{ savingAccount ? t('common.saving') : t('settings.saveProfile') }}</button></div>
      </form>
      <div class="settings-profile-aside">
        <section class="settings-surface settings-language"><Globe :size="23" :stroke-width="1.4" /><h3>{{ t('settings.language') }}</h3><p>{{ t('settings.languageHint') }}</p><LangSwitcher /><span class="settings-small-note">{{ t('settings.languageSaved') }}</span></section>
        <section class="settings-archive-note"><span class="settings-eyebrow">{{ t('settings.atAGlance') }}</span><div><strong>{{ store.summary.totalEvents }}</strong><span>{{ t('common.entries') }}</span></div><div><strong>{{ store.summary.totalCategories }}</strong><span>{{ t('dashboard.statCategories') }}</span></div><span class="settings-archive-mark" aria-hidden="true">C.</span></section>
      </div>
    </div>

    <div v-else-if="section === 'security'" class="settings-security-stack">
      <form class="settings-surface" @submit.prevent="saveAccount">
        <div class="settings-card-heading"><span class="settings-icon-tile"><KeyRound :size="21" :stroke-width="1.5" /></span><div><h3>{{ t('settings.passwordTitle') }}</h3><p>{{ t('userPanel.passwordChangeNote') }}</p></div></div>
        <div class="settings-form-body settings-password-fields">
          <label class="settings-field"><span>{{ t('userPanel.currentPassword') }}</span><input v-model="account.currentPassword" type="password" class="paper-input" autocomplete="current-password" required /></label>
          <label class="settings-field"><span>{{ t('userPanel.newPassword') }}</span><input v-model="account.newPassword" type="password" class="paper-input" :placeholder="t('userPanel.placeholderNewPassword')" autocomplete="new-password" minlength="12" required /></label>
          <label class="settings-field"><span>{{ t('login.labelPasswordConfirm') }}</span><input v-model="passwordConfirm" type="password" class="paper-input" autocomplete="new-password" minlength="12" required /></label>
        </div>
        <div class="settings-savebar"><span class="settings-small-note"><LockKeyhole :size="14" />{{ t('settings.passwordHint') }}</span><button class="ink-button settings-primary" type="submit" :disabled="savingAccount">{{ savingAccount ? t('common.saving') : t('settings.changePassword') }}</button></div>
      </form>
      <details class="settings-danger"><summary><span><TriangleAlert :size="18" />{{ t('settings.dangerTitle') }}</span><ChevronDown :size="16" /></summary><div><p>{{ t('settings.dangerNote') }}</p><button class="settings-danger-button" type="button" :disabled="deletingAccount" @click="removeAccount">{{ deletingAccount ? t('common.deleting') : t('userPanel.deleteAccount') }}<ArrowUpRight :size="15" /></button></div></details>
    </div>

    <div v-else-if="section === 'members' && store.isAdmin" class="settings-member-stack">
      <section class="settings-surface settings-member-list">
        <div class="settings-card-heading"><span class="settings-icon-tile"><Users :size="21" :stroke-width="1.5" /></span><div><h3>{{ t('settings.membersTitle') }}</h3><p>{{ t('settings.memberCount', { count: store.adminUsers.length }) }}</p></div></div>
        <div v-for="user in store.adminUsers" :key="user.id" class="settings-member">
          <span class="settings-member-avatar" :style="{ backgroundColor: user.color }">{{ user.name.charAt(0).toUpperCase() }}</span>
          <div class="settings-member-name"><strong>{{ user.name }}<span v-if="user.id === store.me?.id">{{ t('settings.you') }}</span></strong><p>{{ user.email }}</p></div>
          <div class="settings-member-actions"><select class="paper-input" :aria-label="t('settings.roleFor', { name: user.name })" :value="user.role" :disabled="user.id === store.me?.id" @change="changeRole(user.id, ($event.target as HTMLSelectElement).value)"><option value="user">{{ t('userPanel.roleUser') }}</option><option value="admin">{{ t('userPanel.roleAdmin') }}</option></select><button class="settings-key-button" type="button" :aria-label="t('settings.passwordFor', { name: user.name })" :title="t('userPanel.setPassword')" @click="resetUserPassword(user.id, user.name)"><KeyRound :size="17" /></button></div>
        </div>
      </section>
      <details class="settings-surface settings-add-member"><summary><span><Plus :size="19" />{{ t('userPanel.createUser') }}</span><ChevronDown :size="17" /></summary>
        <form class="settings-new-member-form" @submit.prevent="createUser">
          <label class="settings-field"><span>{{ t('userPanel.name') }}</span><input v-model="newUser.name" class="paper-input" maxlength="60" required /></label>
          <label class="settings-field"><span>{{ t('userPanel.email') }}</span><input v-model="newUser.email" type="email" class="paper-input" autocomplete="off" required /></label>
          <label class="settings-field"><span>{{ t('userPanel.password') }}</span><input v-model="newUser.password" type="password" class="paper-input" minlength="12" autocomplete="new-password" required /></label>
          <label class="settings-field"><span>{{ t('userPanel.role') }}</span><select v-model="newUser.role" class="paper-input"><option value="user">{{ t('userPanel.roleUser') }}</option><option value="admin">{{ t('userPanel.roleAdmin') }}</option></select></label>
          <label class="settings-field"><span>{{ t('userPanel.color') }}</span><input v-model="newUser.color" type="color" class="paper-input h-12" /></label>
          <div class="settings-new-member-submit"><button class="ink-button settings-primary" type="submit" :disabled="creatingUser"><Plus :size="16" />{{ creatingUser ? t('userPanel.creating') : t('userPanel.createUser') }}</button></div>
        </form>
      </details>
      <p class="settings-small-note"><Shield :size="14" />{{ t('settings.adminHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUpRight, Check, ChevronDown, Globe, KeyRound, LockKeyhole, Mail, Palette, Plus, Shield, TriangleAlert, Users } from 'lucide-vue-next';
import LangSwitcher from './LangSwitcher.vue';
import { useRouter } from 'vue-router';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const props = defineProps<{ section: 'profile' | 'security' | 'members' }>();
const { t } = useI18n();
const passwordConfirm = ref('');
const colors = [
  { name: 'forest', value: '#36594a' }, { name: 'ochre', value: '#b18442' },
  { name: 'terracotta', value: '#b4634f' }, { name: 'blue', value: '#527594' },
  { name: 'violet', value: '#7c3aed' }, { name: 'charcoal', value: '#45423d' },
];
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

const profileDirty = computed(() => account.name.trim() !== store.me?.name || account.color !== store.me?.color);

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
    passwordConfirm.value = '';
  },
  { immediate: true },
);

async function saveAccount() {
  if (savingAccount.value) return;
  if (props.section === 'security' && account.newPassword !== passwordConfirm.value) {
    toast.error(t('login.errorPasswordsDiffer'));
    return;
  }
  if (props.section === 'security' && account.newPassword.length < 12) {
    toast.error(t('userPanel.errorPasswordTooShort'));
    return;
  }
  savingAccount.value = true;
  try {
    await store.updateAccount(props.section === 'security' ? {
      currentPassword: account.currentPassword,
      newPassword: account.newPassword,
    } : { name: account.name.trim(), color: account.color });
    account.currentPassword = '';
    account.newPassword = '';
    passwordConfirm.value = '';
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

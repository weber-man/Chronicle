<template>
  <div class="settings-page">
    <header class="settings-header paper-panel" aria-labelledby="settings-title">
      <div class="settings-header-copy">
        <p class="paper-chip settings-header-label">Chronicles <span aria-hidden="true">·</span> {{ t('settings.chapter') }}</p>
        <h1 id="settings-title" class="paper-heading">{{ t('account.heading') }}</h1>
        <p class="settings-lead">{{ t('settings.headerIntro') }}</p>
        <div class="settings-header-actions">
          <button class="paper-button settings-back" type="button" @click="close"><ArrowLeft :size="16" /> {{ t('settings.back') }}</button>
          <button class="paper-button settings-logout" type="button" :disabled="loggingOut" @click="logout"><LogOut :size="15" /><span>{{ t('account.logout') }}</span></button>
        </div>
      </div>
      <div class="settings-identity">
        <div class="identity-top"><span>CHRONICLES</span><span>{{ t('settings.personalArchive') }}</span></div>
        <div class="identity-person">
          <span class="identity-avatar" :style="{ backgroundColor: store.me?.color }">{{ initial }}</span>
          <div><h2>{{ store.me?.name }}</h2><p>{{ store.me?.email }}</p></div>
        </div>
        <div class="identity-bottom"><span><span class="identity-dot"></span>{{ store.isAdmin ? t('common.admin') : t('common.user') }}</span><span>{{ memberSince }}</span></div>
      </div>
    </header>

    <div class="settings-workspace">
      <aside class="settings-sidebar">
        <p class="settings-nav-label">{{ t('settings.overview') }}</p>
        <nav ref="nav" class="settings-nav" :aria-label="t('account.heading')">
          <button v-for="(item, index) in sections" :key="item.id" type="button" :class="{ 'is-active': activeSection === item.id }" :aria-current="activeSection === item.id ? 'page' : undefined" aria-controls="settings-content" @click="selectSection(item.id)">
            <component :is="item.icon" :size="18" :stroke-width="1.6" /><span>{{ item.label }}</span><span class="settings-nav-index" aria-hidden="true">0{{ index + 1 }}</span>
          </button>
        </nav>
        <div class="settings-sidebar-note"><LockKeyhole :size="20" :stroke-width="1.4" /><strong>{{ t('settings.yourStory') }}</strong><p>{{ t('settings.yourStoryNote') }}</p></div>
        <span class="settings-version">Chronicles {{ store.appVersion ? `v${store.appVersion}` : '' }}</span>
      </aside>

      <div id="settings-content" class="settings-content">
        <div class="settings-section-heading">
          <div><p class="settings-eyebrow">{{ activeIndex }} / {{ t('settings.chapter') }}</p><h2 ref="sectionHeading" tabindex="-1">{{ activeItem.title }}</h2><p>{{ activeItem.description }}</p></div>
          <span class="settings-section-symbol" aria-hidden="true"><component :is="activeItem.icon" :size="24" :stroke-width="1.3" /></span>
        </div>

        <UserPanel v-show="['profile', 'security', 'members'].includes(activeSection)" :section="activeSection === 'security' || activeSection === 'members' ? activeSection : 'profile'" />

        <div v-show="activeSection === 'ai'" class="settings-ai-layout">
          <div class="settings-surface">
            <p v-if="aiLoading" class="settings-loading" role="status"><span class="settings-loading-dot"></span>{{ t('assistant.loadingSettings') }}</p>
            <div v-else-if="aiError" class="settings-empty" role="alert"><p>{{ aiError }}</p><button class="paper-button rounded-xl px-4 py-2 text-sm" type="button" @click="loadAi">{{ t('assistant.retry') }}</button></div>
            <AiSettingsPanel v-else />
          </div>
          <aside class="settings-ai-note"><Sparkles :size="26" :stroke-width="1.3" /><h3>{{ t('settings.aiNoteTitle') }}</h3><p>{{ t('settings.aiNote') }}</p><div><Shield :size="16" /><span>{{ t('aiSettings.keyEncrypted') }}</span></div></aside>
        </div>

        <DataPanel v-show="activeSection === 'data'" />
      </div>
    </div>
    <footer class="settings-footer"><span>CHRONICLES</span><p>{{ t('settings.footer') }}</p><span aria-hidden="true">✳</span></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Database, LockKeyhole, LogOut, Shield, Sparkles, UserRound, Users } from 'lucide-vue-next';
import DataPanel from '../components/DataPanel.vue';
import AiSettingsPanel from '../components/AiSettingsPanel.vue';
import UserPanel from '../components/UserPanel.vue';
import { useLifelineStore } from '../stores/lifeline';
import { useAiStore } from '../stores/ai';
import { useToastStore } from '../stores/toast';
import { translateApiError } from '../i18n';
import '../assets/account.css';

type Section = 'profile' | 'security' | 'ai' | 'data' | 'members';
const { t, locale } = useI18n();
const store = useLifelineStore();
const route = useRoute();
const router = useRouter();
const ai = useAiStore();
const toast = useToastStore();
const aiLoading = ref(true);
const aiError = ref('');
const loggingOut = ref(false);
const sectionHeading = ref<HTMLElement | null>(null);
const nav = ref<HTMLElement | null>(null);
const sections = computed(() => [
  { id: 'profile' as const, icon: UserRound, label: t('settings.profile'), title: t('settings.profileTitle'), description: t('settings.profileDescription') },
  { id: 'security' as const, icon: Shield, label: t('settings.security'), title: t('settings.securityTitle'), description: t('settings.securityDescription') },
  { id: 'ai' as const, icon: Sparkles, label: t('settings.ai'), title: t('settings.aiTitle'), description: t('settings.aiDescription') },
  { id: 'data' as const, icon: Database, label: t('settings.data'), title: t('settings.dataTitle'), description: t('settings.dataDescription') },
  ...(store.isAdmin ? [{ id: 'members' as const, icon: Users, label: t('settings.members'), title: t('settings.membersTitle'), description: t('settings.membersDescription') }] : []),
]);
const activeSection = computed<Section>(() => {
  const section = route.query.section ?? (route.query.capture === 'ai' ? 'ai' : 'profile');
  return sections.value.find(item => item.id === section)?.id ?? 'profile';
});
const activeItem = computed(() => sections.value.find(item => item.id === activeSection.value)!);
const activeIndex = computed(() => String(sections.value.findIndex(item => item.id === activeSection.value) + 1).padStart(2, '0'));
const initial = computed(() => store.me?.name.trim().charAt(0).toUpperCase() || 'C');
const memberSince = computed(() => {
  const raw = store.me?.createdAt;
  if (!raw) return '';
  const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? '' : t('settings.memberSince', { date: new Intl.DateTimeFormat(locale.value, { month: 'short', year: 'numeric' }).format(date) });
});
function revealActiveSection() {
  const container = nav.value;
  const current = container?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!container || !current || container.scrollWidth <= container.clientWidth) return;
  container.scrollLeft += current.getBoundingClientRect().left - container.getBoundingClientRect().left - (container.clientWidth - current.offsetWidth) / 2;
}
watch(activeSection, () => { void nextTick(revealActiveSection); });
onMounted(() => { revealActiveSection(); void loadAi(); });
async function loadAi() {
  aiLoading.value = true;
  aiError.value = '';
  try { await ai.ensureLoaded(); }
  catch (error) { aiError.value = translateApiError(error) || t('assistant.loadFailed'); }
  finally { aiLoading.value = false; }
}
async function selectSection(section: Section) {
  await router.replace({ query: { ...route.query, section } });
  await nextTick();
  sectionHeading.value?.focus({ preventScroll: true });
}
const returnPath = computed(() => {
  const from = typeof route.query.from === 'string' ? route.query.from : '/';
  return ['/', '/timeline', '/insights', '/trash'].includes(from) ? from : '/';
});
async function close() {
  await router.push({ path: returnPath.value, query: route.query.capture === 'ai' ? { capture: 'ai' } : {} });
}
async function logout() {
  loggingOut.value = true;
  try { await store.logout(); await router.replace({ name: 'login' }); }
  catch (error) { toast.error(translateApiError(error) || t('login.actionFailed')); }
  finally { loggingOut.value = false; }
}
</script>

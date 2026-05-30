<template>
  <div class="space-y-6">
    <div class="grid gap-4 md:grid-cols-3">
      <StatCard label="Ereignisse" :value="store.summary.totalEvents" hint="Zeitpunkte und Zeitspannen zusammen" />
      <StatCard label="Nutzer" :value="store.summary.totalUsers" hint="Mit eigener Perspektive" />
      <StatCard label="Zeitraum" :value="store.summary.rangeLabel" :hint="`${store.summary.ongoingEvents} laufende Einträge`" />
    </div>

    <div class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <UserPanel />
      <EventForm :editing-event="editingEvent" @saved="editingEvent = null" @cancel="editingEvent = null" />
    </div>

    <EventList :events="store.events" :users="store.users" @edit="editingEvent = $event" @remove="removeEvent($event)" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import EventForm from '../components/EventForm.vue';
import EventList from '../components/EventList.vue';
import StatCard from '../components/StatCard.vue';
import UserPanel from '../components/UserPanel.vue';
import type { LifeEvent } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();
const editingEvent = ref<LifeEvent | null>(null);

onMounted(async () => {
  if (!store.users.length) await store.bootstrap();
});

async function removeEvent(event: LifeEvent) {
  if (!window.confirm(`"${event.title}" wirklich löschen?`)) return;
  if (editingEvent.value?.id === event.id) editingEvent.value = null;
  await store.removeEvent(event.id);
}
</script>

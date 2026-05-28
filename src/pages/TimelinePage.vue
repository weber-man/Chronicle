<template>
  <div class="space-y-6">
    <UserPanel />
    <TimelineCanvas :events="store.events" :users="store.users" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import TimelineCanvas from '../components/TimelineCanvas.vue';
import UserPanel from '../components/UserPanel.vue';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();

onMounted(async () => {
  if (!store.users.length) await store.bootstrap();
});
</script>

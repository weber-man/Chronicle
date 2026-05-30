<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-stone-500">Nutzer</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">Wer schaut gerade auf die Timeline?</h2>
      </div>
      <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium transition" @click="isCreating = !isCreating">
        {{ isCreating ? 'Schließen' : 'Nutzer anlegen' }}
      </button>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <button
        class="rounded-2xl border px-4 py-3 text-left transition"
        :class="store.selectedUserId === null ? 'border-amber-900/35 bg-amber-100/75 text-stone-900 shadow-sm' : 'paper-subtle text-stone-600 hover:text-stone-900'"
        @click="store.selectUser(null)"
      >
        <p class="font-medium">Alle</p>
        <p class="text-xs opacity-70">Gesamte gemeinsame Timeline</p>
      </button>

      <button
        v-for="user in store.users"
        :key="user.id"
        class="min-w-44 rounded-2xl border px-4 py-3 text-left transition"
        :class="store.selectedUserId === user.id ? 'border-amber-900/35 bg-amber-50/90 text-stone-900 shadow-md' : 'paper-subtle text-stone-600 hover:border-amber-900/25 hover:text-stone-900'"
        @click="store.selectUser(user.id)"
      >
        <div class="flex items-center gap-3">
          <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: user.color }" />
          <p class="font-medium">{{ user.name }}</p>
        </div>
      </button>
    </div>

    <form v-if="isCreating" class="paper-subtle mt-5 grid gap-4 rounded-3xl p-4 sm:grid-cols-[1fr_auto_auto]" @submit.prevent="submit">
      <input v-model="name" class="paper-input w-full rounded-2xl px-4 py-3 outline-none ring-0" placeholder="z. B. Manuel" />
      <input v-model="color" type="color" class="paper-input h-12 w-full rounded-2xl p-2" />
      <button class="ink-button rounded-2xl px-4 py-3 font-medium transition hover:scale-[1.01]" type="submit">Speichern</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();
const isCreating = ref(false);
const name = ref('');
const color = ref('#7c3aed');

async function submit() {
  if (!name.value.trim()) return;
  await store.addUser({ name: name.value.trim(), color: color.value });
  name.value = '';
  color.value = '#7c3aed';
  isCreating.value = false;
}
</script>

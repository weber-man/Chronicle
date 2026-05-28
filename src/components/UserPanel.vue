<template>
  <section class="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-slate-300">Nutzer</p>
        <h2 class="text-xl font-semibold text-white">Wer schaut gerade auf die Timeline?</h2>
      </div>
      <button class="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20" @click="isCreating = !isCreating">
        {{ isCreating ? 'Schließen' : 'Nutzer anlegen' }}
      </button>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <button
        class="rounded-2xl border px-4 py-3 text-left transition"
        :class="store.selectedUserId === null ? 'border-sky-300/40 bg-sky-300/15 text-white' : 'border-white/10 bg-slate-950/40 text-slate-300 hover:text-white'"
        @click="store.selectUser(null)"
      >
        <p class="font-medium">Alle</p>
        <p class="text-xs opacity-70">Gesamte gemeinsame Timeline</p>
      </button>

      <button
        v-for="user in store.users"
        :key="user.id"
        class="min-w-44 rounded-2xl border px-4 py-3 text-left transition"
        :class="store.selectedUserId === user.id ? 'border-white/30 bg-white/15 text-white shadow-lg' : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-white/20 hover:text-white'"
        @click="store.selectUser(user.id)"
      >
        <div class="flex items-center gap-3">
          <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: user.color }" />
          <p class="font-medium">{{ user.name }}</p>
        </div>
      </button>
    </div>

    <form v-if="isCreating" class="mt-5 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/40 p-4 sm:grid-cols-[1fr_auto_auto]" @submit.prevent="submit">
      <input v-model="name" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500" placeholder="z. B. Manuel" />
      <input v-model="color" type="color" class="h-12 w-full rounded-2xl border border-white/10 bg-white/5 p-2" />
      <button class="rounded-2xl bg-white px-4 py-3 font-medium text-slate-950 transition hover:scale-[1.01]" type="submit">Speichern</button>
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

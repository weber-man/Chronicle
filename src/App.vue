<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_52%,#020617_100%)] text-slate-100">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-sky-950/30 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">
            Lifeline
          </p>
          <h1 class="text-3xl font-semibold tracking-tight text-white">Momente & Zeitspannen mit Kontext festhalten</h1>
          <p class="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
            Ein ruhiges, modernes Archiv für das, was dein Leben geprägt hat — von einzelnen Tagen bis zu prägenden Jahren.
          </p>
        </div>

        <nav class="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-1.5">
          <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white" active-class="bg-white text-slate-950 shadow-lg shadow-sky-500/20">
            {{ item.label }}
          </RouterLink>
        </nav>
      </header>

      <main class="flex-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const navItems = [
  { to: '/', label: 'Liste & Erfassen' },
  { to: '/timeline', label: 'Timeline' },
];
</script>

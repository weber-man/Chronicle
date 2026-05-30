<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,248,228,0.42),_transparent_32%),linear-gradient(180deg,rgba(247,235,208,0.62)_0%,rgba(225,208,175,0.56)_55%,rgba(211,191,151,0.62)_100%)] text-stone-800">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="paper-panel mb-6 flex flex-col gap-4 rounded-[2rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="paper-chip mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            Lifeline
          </p>
          <h1 class="paper-heading text-3xl font-semibold tracking-tight text-stone-900">Momente & Zeitspannen mit Kontext festhalten</h1>
        </div>

        <nav class="paper-nav flex items-center gap-2 rounded-2xl p-1.5">
          <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="paper-nav-link rounded-xl px-4 py-2 text-sm font-medium transition">
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

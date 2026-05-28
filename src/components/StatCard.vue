<template>
  <div class="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-slate-950/30 backdrop-blur-xl">
    <p class="text-sm text-slate-400">{{ label }}</p>
    <div class="mt-3 flex items-end justify-between gap-3">
      <div>
        <p class="text-2xl font-semibold text-white">{{ value }}</p>
        <p v-if="hint" class="mt-1 text-xs text-slate-400">{{ hint }}</p>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string | number; hint?: string }>();
</script>

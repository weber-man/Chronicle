<template>
  <div class="paper-panel metric-card panel-reveal rounded-3xl p-5">
    <p class="text-sm text-stone-500">{{ label }}</p>
    <div class="mt-3 flex items-end justify-between gap-3">
      <div>
        <p class="paper-heading text-2xl font-semibold text-stone-900">{{ value }}</p>
        <p v-if="hint" class="mt-1 text-xs text-stone-500">{{ hint }}</p>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string | number; hint?: string }>();
</script>

<template>
  <div class="paper-nav paper-nav-tabs relative grid items-center gap-2 rounded-2xl p-1.5" :style="navStyle">
    <span class="absolute inset-1.5 grid gap-2" :style="navStyle" aria-hidden="true">
      <span class="paper-nav-indicator rounded-xl" :style="indicatorStyle"></span>
    </span>
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="paper-nav-link relative z-10 min-w-0 rounded-xl px-3 py-2 text-xs font-medium leading-tight transition sm:px-4 sm:text-sm"
      :class="{ 'is-active': item.value === modelValue }"
      @click="$emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type SegmentedTabItem = {
  value: string;
  label: string;
};

const props = defineProps<{
  items: SegmentedTabItem[];
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();

const activeIndex = computed(() => Math.max(props.items.findIndex((item) => item.value === props.modelValue), 0));

const navStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.items.length || 1}, minmax(0, 1fr))`,
}));

const indicatorStyle = computed(() => ({
  gridColumn: `${activeIndex.value + 1}`,
  gridRow: '1',
}));
</script>

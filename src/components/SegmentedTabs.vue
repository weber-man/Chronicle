<template>
  <div class="paper-nav paper-nav-tabs relative grid items-center gap-2 rounded-2xl p-1.5" :style="navStyle">
    <span class="paper-nav-indicator absolute top-1.5 bottom-1.5 left-1.5 rounded-xl" :style="indicatorStyle"></span>
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="paper-nav-link relative z-10 rounded-xl px-4 py-2 text-sm font-medium transition"
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
  width: `calc((100% - ${Math.max(props.items.length - 1, 0) * 0.5}rem) / ${props.items.length || 1})`,
  transform: `translateX(calc(${activeIndex.value} * 100% + ${activeIndex.value} * 0.5rem))`,
}));
</script>

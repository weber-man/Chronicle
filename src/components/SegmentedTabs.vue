<template>
  <div ref="navRef" class="paper-nav paper-nav-tabs relative grid items-center gap-2 rounded-2xl p-1.5" :style="navStyle">
    <span
      class="paper-nav-indicator pointer-events-none absolute left-0 top-0 rounded-xl"
      :style="indicatorStyle"
      aria-hidden="true"
    ></span>
    <button
      v-for="item in items"
      :key="item.value"
      :ref="(element) => setButtonRef(item.value, element)"
      class="paper-nav-link relative z-10 min-w-0 rounded-xl px-2 py-2 text-xs font-medium leading-tight transition sm:px-4 sm:text-sm"
      :class="{ 'is-active': item.value === modelValue }"
      type="button"
      :aria-label="item.label"
      :aria-current="item.value === modelValue ? 'page' : undefined"
      @click="$emit('update:modelValue', item.value)"
    >
      <span v-if="item.shortLabel" class="sm:hidden">{{ item.shortLabel }}</span>
      <span :class="item.shortLabel ? 'hidden sm:inline' : ''">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';

type SegmentedTabItem = {
  value: string;
  label: string;
  shortLabel?: string;
};

const props = defineProps<{
  items: SegmentedTabItem[];
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();

const navRef = ref<HTMLElement | null>(null);
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });
const buttonRefs = new Map<string, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

const navStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.items.length || 1}, minmax(0, 1fr))`,
}));

function setButtonRef(value: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) buttonRefs.set(value, element);
  else buttonRefs.delete(value);
}

function observeButtons() {
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  if (navRef.value) resizeObserver.observe(navRef.value);
  for (const button of buttonRefs.values()) resizeObserver.observe(button);
}

function measureIndicator() {
  const button = buttonRefs.get(props.modelValue) ?? buttonRefs.get(props.items[0]?.value ?? '');
  if (!button) {
    indicatorStyle.value = { opacity: '0' };
    return;
  }

  indicatorStyle.value = {
    opacity: '1',
    width: `${button.offsetWidth}px`,
    height: `${button.offsetHeight}px`,
    transform: `translate3d(${button.offsetLeft}px, ${button.offsetTop}px, 0)`,
  };
}

function queueMeasure() {
  void nextTick(measureIndicator);
}

function queueLayoutRefresh() {
  void nextTick(() => {
    measureIndicator();
    observeButtons();
  });
}

watch(() => props.modelValue, queueMeasure);
watch(
  () => props.items.map((item) => `${item.value}:${item.label}`).join('|'),
  queueLayoutRefresh,
);

onMounted(() => {
  resizeObserver = new ResizeObserver(queueMeasure);
  observeButtons();
  measureIndicator();
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    void document.fonts.ready.then(queueMeasure);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  buttonRefs.clear();
});
</script>

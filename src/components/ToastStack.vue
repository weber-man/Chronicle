<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:w-[24rem]" aria-live="polite">
      <TransitionGroup name="toast-item" tag="div" class="flex w-full flex-col gap-2">
        <article
          v-for="toast in store.toasts"
          :key="toast.id"
          class="toast-card pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-xl backdrop-blur"
          :class="cardClass(toast.kind)"
          :role="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <div class="flex items-start gap-3">
            <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold" :class="badgeClass(toast.kind)" aria-hidden="true">
              {{ toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i' }}
            </span>
            <p class="flex-1 text-sm leading-5">{{ toast.message }}</p>
            <button class="rounded-lg px-1.5 text-lg leading-none opacity-60 transition hover:opacity-100" type="button" aria-label="Meldung schließen" @click="store.dismiss(toast.id)">×</button>
          </div>
          <div v-if="toast.action" class="mt-2 flex justify-end">
            <button class="paper-button rounded-xl px-3 py-1.5 text-xs font-medium" type="button" @click="store.runAction(toast)">
              {{ toast.action.label }}
            </button>
          </div>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToastStore, type ToastKind } from '../stores/toast';

const store = useToastStore();

function cardClass(kind: ToastKind) {
  if (kind === 'success') return 'border-emerald-900/20 bg-[rgba(238,250,241,0.96)] text-emerald-950';
  if (kind === 'error') return 'border-rose-900/25 bg-[rgba(255,239,239,0.97)] text-rose-950';
  return 'border-amber-900/20 bg-[rgba(255,249,236,0.97)] text-stone-800';
}

function badgeClass(kind: ToastKind) {
  if (kind === 'success') return 'bg-emerald-800 text-emerald-50';
  if (kind === 'error') return 'bg-rose-800 text-rose-50';
  return 'bg-amber-800 text-amber-50';
}
</script>

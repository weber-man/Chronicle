import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void | Promise<unknown>;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  function dismiss(id: number) {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function push(kind: ToastKind, message: string, options: { action?: ToastAction; duration?: number } = {}) {
    const id = nextId++;
    toasts.value = [...toasts.value.slice(-3), { id, kind, message, action: options.action }];
    const duration = options.duration ?? (options.action ? 9000 : kind === 'error' ? 7000 : 4500);
    const timer = setTimeout(() => dismiss(id), duration);
    timers.set(id, timer);
    return id;
  }

  function success(message: string, action?: ToastAction) {
    return push('success', message, { action });
  }

  function error(message: string) {
    return push('error', message);
  }

  function info(message: string, action?: ToastAction) {
    return push('info', message, { action });
  }

  async function runAction(toast: Toast) {
    dismiss(toast.id);
    try {
      await toast.action?.run();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    }
  }

  return { toasts, push, success, error, info, dismiss, runAction };
});

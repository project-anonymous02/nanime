import { create } from 'zustand';

/** Toaster global — pesan singkat yang tidak pernah memblokir layar. */

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastItem {
  id: string;
  text: string;
  kind: ToastKind;
  title?: string;
}

interface UIStore {
  toasts: ToastItem[];
  push(text: string, kind?: ToastKind, title?: string): void;
  dismiss(id: string): void;
}

let seq = 0;

export const useUI = create<UIStore>(set => ({
  toasts: [],
  push(text, kind = 'info', title) {
    const id = 't' + ++seq;
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, text, kind, title }] }));
    window.setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3200);
  },
  dismiss(id) {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  }
}));

/** Panggil dari mana saja (bukan hook). */
export function toast(text: string, kind: ToastKind = 'info', title?: string): void {
  useUI.getState().push(text, kind, title);
}

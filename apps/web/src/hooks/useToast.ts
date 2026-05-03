// Minimal toast implementation (no external lib needed)
import * as React from 'react';
import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type ToastWithId = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action =
  | { type: 'ADD'; toast: ToastWithId }
  | { type: 'UPDATE'; toast: Partial<ToastWithId> & { id: string } }
  | { type: 'DISMISS'; toastId?: string }
  | { type: 'REMOVE'; toastId?: string };

interface State {
  toasts: ToastWithId[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: 'REMOVE', toastId });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'UPDATE':
      return {
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };
    case 'DISMISS': {
      return {
        toasts: state.toasts.map((t) =>
          !action.toastId || t.id === action.toastId ? { ...t, open: false } : t,
        ),
      };
    }
    case 'REMOVE':
      return { toasts: action.toastId ? state.toasts.filter((t) => t.id !== action.toastId) : [] };
  }
}

// Module-level state so all hook instances share state
let memoryState: State = { toasts: [] };
const listeners: Array<React.Dispatch<React.SetStateAction<State>>> = [];

function dispatchGlobal(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

export type Toast = Omit<ToastWithId, 'id'>;

function toast(props: Toast) {
  const id = genId();
  const update = (p: ToastWithId) => dispatchGlobal({ type: 'UPDATE', toast: { ...p, id } });
  const dismiss = () => dispatchGlobal({ type: 'DISMISS', toastId: id });

  dispatchGlobal({
    type: 'ADD',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) {
          addToRemoveQueue(id, dispatchGlobal);
          dismiss();
        }
      },
    },
  });
  return { id, dismiss, update };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatchGlobal({ type: 'DISMISS', toastId }),
  };
}

export { toast };

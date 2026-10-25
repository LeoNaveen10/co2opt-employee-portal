import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import './toast.css';

type ToastKind = 'success' | 'error';
type Toast = { id: number; message: string; kind: ToastKind };
type ToastContextValue = {
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 2000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const element = useRef<HTMLDivElement>(null);
  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ id: ++nextId.current, message, kind });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    // The top layer keeps feedback visible even while a modal dialog is open.
    if (element.current?.showPopover) {
      element.current.setAttribute('popover', 'manual');
      element.current.showPopover();
    }
    const timer = window.setTimeout(dismissToast, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <ToastContext.Provider value={{ notify, dismissToast }}>
      {children}
      {toast && (
        <div key={toast.id} ref={element} className={`toast toast-${toast.kind}`}>
          <span role={toast.kind === 'error' ? 'alert' : 'status'} aria-atomic="true">{toast.message}</span>
          <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={dismissToast}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

import { useEffect, useRef, type ReactNode } from 'react';

export function RecommendationDialog({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className="recommendation-dialog" aria-labelledby="recommendation-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <button type="button" className="dialog-close" aria-label="Close recommendation form" disabled={busy} onClick={onClose}><span className="close-icon" aria-hidden="true" /></button>
    {children}
  </dialog>;
}

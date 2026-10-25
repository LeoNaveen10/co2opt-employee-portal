import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ children, busy, onClose, titleId, closeLabel = 'Close dialog' }: {
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
  titleId: string;
  closeLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);

  function isOutside(clientX: number, clientY: number) {
    const bounds = dialog.current?.getBoundingClientRect();
    return !!bounds && (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom);
  }
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby={titleId} onPointerDown={(event) => {
      pointerStartedOutside.current = event.target === event.currentTarget && isOutside(event.clientX, event.clientY);
    }} onPointerCancel={() => { pointerStartedOutside.current = false; }} onClick={(event) => {
      const shouldClose = pointerStartedOutside.current && event.target === event.currentTarget && isOutside(event.clientX, event.clientY);
      pointerStartedOutside.current = false;
      if (shouldClose && !busy) onClose();
    }} onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }}>
      <button type="button" className="dialog-close" aria-label={closeLabel} disabled={busy} onClick={onClose}>
        <span className="close-icon" aria-hidden="true" />
      </button>
      {children}
    </dialog>
  );
}

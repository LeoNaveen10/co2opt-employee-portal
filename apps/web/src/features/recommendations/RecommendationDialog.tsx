import type { ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';

export function RecommendationDialog({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  return (
    <Dialog busy={busy} onClose={onClose} titleId="recommendation-dialog-title" closeLabel="Close recommendation form">
      {children}
    </Dialog>
  );
}

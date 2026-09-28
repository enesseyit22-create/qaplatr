import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function SafeCenterModal({
  children,
  onClose,
  zIndex = 2200,
}: {
  children: ReactNode;
  onClose: () => void;
  zIndex?: number;
}) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{
        zIndex,
        paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.42)',
      }}
    >
      <button type="button" className="absolute inset-0" aria-label="Kapat" onClick={onClose} />
      <div className="relative max-h-[min(86dvh,640px)] w-full max-w-sm overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>,
    document.body,
  );
}

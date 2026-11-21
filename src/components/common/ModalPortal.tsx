import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Renders modals directly into document.body so CSS containing blocks
 * (transforms/filters/scroll containers) never trap `position: fixed` overlays
 * off-screen.
 */
let activeModalPortalCount = 0;
let originalBodyOverflow = '';

export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  useEffect(() => {
    if (activeModalPortalCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeModalPortalCount += 1;
    return () => {
      activeModalPortalCount = Math.max(0, activeModalPortalCount - 1);
      if (activeModalPortalCount === 0) {
        document.body.style.overflow = originalBodyOverflow;
      }
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

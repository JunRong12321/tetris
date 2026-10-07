interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  dismissable?: boolean;
}

export function Modal({ open, onClose, children, dismissable = true }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onClick={dismissable && onClose ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

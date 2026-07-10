import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export default function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-[#3a4d40] bg-[#16241c] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-[#3a4d40] text-[#7d9186] hover:text-white" aria-label="Đóng">×</button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

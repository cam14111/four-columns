import { X } from "lucide-react";

// Full-screen sliding panel used for Rules / Stats / Settings / Menu.
export const Panel = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => (
  <div className="fixed inset-0 z-40 flex justify-center bg-slate-950/80 backdrop-blur-sm">
    <div className="animate-float-up flex h-[100dvh] w-full max-w-md flex-col bg-slate-900 text-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </header>
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  </div>
);

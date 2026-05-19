import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Variant = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  text: string;
  variant: Variant;
}

const Ctx = createContext<{
  toast: (text: string, variant?: Variant) => void;
} | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);

  const toast = useCallback((text: string, variant: Variant = 'info') => {
    const id = ++_id;
    setList((l) => [...l, { id, text, variant }]);
    setTimeout(() => {
      setList((l) => l.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {list.map((t) => (
          <div
            key={t.id}
            className={`glass-strong px-4 py-3 rounded-xl text-sm shadow-glow animate-[slideIn_.2s_ease-out] border-l-2 ${
              t.variant === 'success'
                ? 'border-l-emerald-400 text-emerald-200'
                : t.variant === 'error'
                ? 'border-l-rose-400 text-rose-200'
                : 'border-l-iris-400 text-iris-200'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast needs ToastProvider');
  return c.toast;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type ViewAs = {
  viewAsUserId: string | null;
  setViewAsUserId: (id: string | null) => void;
};

const Ctx = createContext<ViewAs>({ viewAsUserId: null, setViewAsUserId: () => {} });
const KEY = "colladome:viewAsUserId";

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAsUserId, setState] = useState<string | null>(null);
  useEffect(() => {
    try { setState(localStorage.getItem(KEY)); } catch { /* noop */ }
  }, []);
  const setViewAsUserId = useCallback((id: string | null) => {
    setState(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch { /* noop */ }
  }, []);
  const value = useMemo(() => ({ viewAsUserId, setViewAsUserId }), [viewAsUserId, setViewAsUserId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewAs() { return useContext(Ctx); }

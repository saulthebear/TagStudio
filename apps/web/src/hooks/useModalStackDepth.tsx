import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ModalStackContextValue = {
  stackIds: string[];
  register: (id: string) => void;
  unregister: (id: string) => void;
};

const ModalStackContext = createContext<ModalStackContextValue | null>(null);

export function ModalStackProvider({ children }: { children: ReactNode }) {
  const [stackIds, setStackIds] = useState<string[]>([]);

  const register = useCallback((id: string) => {
    setStackIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const unregister = useCallback((id: string) => {
    setStackIds((prev) => prev.filter((existingId) => existingId !== id));
  }, []);

  const value = useMemo<ModalStackContextValue>(
    () => ({
      stackIds,
      register,
      unregister
    }),
    [register, stackIds, unregister]
  );

  return <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>;
}

export function useModalStackDepth(id: string, open: boolean): {
  depth: number;
  isTopmost: boolean;
} {
  const context = useContext(ModalStackContext);
  if (!context) {
    throw new Error("useModalStackDepth must be used within a ModalStackProvider.");
  }

  const { stackIds, register, unregister } = context;

  useEffect(() => {
    if (!open) {
      return;
    }

    register(id);
    return () => unregister(id);
  }, [id, open, register, unregister]);

  const depth = open ? stackIds.indexOf(id) : -1;
  return {
    depth,
    isTopmost: depth >= 0 && depth === stackIds.length - 1
  };
}

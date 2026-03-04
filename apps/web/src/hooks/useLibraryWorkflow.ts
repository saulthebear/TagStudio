import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";

type LibraryMode = "open" | "create";

type UseLibraryWorkflowArgs = {
  onError: (message: string) => void;
  onClearError: () => void;
};

type UseLibraryWorkflowResult = {
  libraryPath: string;
  setLibraryPath: (value: string) => void;
  activeLibraryPath: string | null;
  isLibraryOpen: boolean;
  libraryModalOpen: boolean;
  openPending: boolean;
  openLibrary: () => void;
  createLibrary: () => void;
  openLibraryModal: () => void;
  closeLibraryModal: () => void;
};

export function useLibraryWorkflow({
  onError,
  onClearError
}: UseLibraryWorkflowArgs): UseLibraryWorkflowResult {
  const queryClient = useQueryClient();
  const lastLibraryModalTriggerRef = useRef<HTMLElement | null>(null);

  const [libraryPath, setLibraryPath] = useState("");
  const [activeLibraryPath, setActiveLibraryPath] = useState<string | null>(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);

  const isLibraryOpen = activeLibraryPath !== null;

  const libraryState = useQuery({
    queryKey: ["library-state"],
    queryFn: () => api.getLibraryState(),
    refetchInterval: 3000
  });

  useEffect(() => {
    const currentPath = libraryState.data?.is_open ? (libraryState.data.library_path ?? null) : null;
    if (currentPath === activeLibraryPath) {
      return;
    }

    setActiveLibraryPath(currentPath);
    if (currentPath) {
      setLibraryPath(currentPath);
    }
  }, [activeLibraryPath, libraryState.data?.is_open, libraryState.data?.library_path]);

  const openLibraryMutation = useMutation({
    mutationFn: (mode: LibraryMode) =>
      mode === "create"
        ? api.createLibrary({ path: libraryPath })
        : api.openLibrary({ path: libraryPath }),
    onSuccess: () => {
      onClearError();
      queryClient.invalidateQueries({ queryKey: ["library-state"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["field-types"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setLibraryModalOpen(false);
      lastLibraryModalTriggerRef.current?.focus();
    },
    onError: (error) => {
      onError(error instanceof Error ? error.message : "Failed to open library.");
    }
  });

  const openLibrary = useCallback(() => {
    openLibraryMutation.mutate("open");
  }, [openLibraryMutation]);

  const createLibrary = useCallback(() => {
    openLibraryMutation.mutate("create");
  }, [openLibraryMutation]);

  const openLibraryModal = useCallback(() => {
    lastLibraryModalTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLibraryModalOpen(true);
  }, []);

  const closeLibraryModal = useCallback(() => {
    setLibraryModalOpen(false);
    lastLibraryModalTriggerRef.current?.focus();
  }, []);

  return {
    libraryPath,
    setLibraryPath,
    activeLibraryPath,
    isLibraryOpen,
    libraryModalOpen,
    openPending: openLibraryMutation.isPending,
    openLibrary,
    createLibrary,
    openLibraryModal,
    closeLibraryModal
  };
}

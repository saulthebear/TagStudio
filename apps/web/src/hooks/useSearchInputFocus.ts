import { useCallback, useRef } from "react";

type FocusOptions = {
  select?: boolean;
};

export function useSearchInputFocus(options?: FocusOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusInput = useCallback(() => {
    const target = inputRef.current;
    if (!target) {
      return;
    }

    target.focus();
    if (options?.select) {
      target.select();
    }
  }, [options?.select]);

  return {
    inputRef,
    focusInput
  };
}

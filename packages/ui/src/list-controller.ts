import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type FrameworkListMutationOptions = {
  /** Reload this list after the mutation succeeds. Defaults to true. */
  reload?: boolean;
};

export type FrameworkListController<T> = {
  rows: T[];
  loading: boolean;
  refreshing: boolean;
  mutating: boolean;
  error: string | null;
  reload: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
  runMutation: (
    mutation: () => Promise<void>,
    options?: FrameworkListMutationOptions,
  ) => Promise<boolean>;
  setRows: Dispatch<SetStateAction<T[]>>;
  clearError: () => void;
};

export type FrameworkListControllerOptions<T> = {
  initialRows?: readonly T[];
  errorMessage?: (error: unknown) => string;
};

function defaultErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim()) return message;
  return "This list could not be loaded. Pull down to try again.";
}

/**
 * Platform-neutral state controller for framework lists.
 *
 * Renderers remain platform-owned: the web adapter uses DOM tables while Expo
 * uses FlatList. Both receive the same component-local loading, refresh,
 * mutation, and error contract without route or browser refreshes.
 */
export function useFrameworkListController<T>(
  loadRows: () => Promise<readonly T[]>,
  options: FrameworkListControllerOptions<T> = {},
): FrameworkListController<T> {
  const [rows, setRows] = useState<T[]>(() => [...(options.initialRows ?? [])]);
  const [phase, setPhase] = useState<"idle" | "loading" | "refreshing">("idle");
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestGeneration = useRef(0);
  const loaderRef = useRef(loadRows);
  const errorMessageRef = useRef(options.errorMessage ?? defaultErrorMessage);
  loaderRef.current = loadRows;
  errorMessageRef.current = options.errorMessage ?? defaultErrorMessage;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, []);

  const load = useCallback(async (nextPhase: "loading" | "refreshing") => {
    const generation = ++requestGeneration.current;
    if (mounted.current) {
      setPhase(nextPhase);
      setError(null);
    }

    try {
      const nextRows = await loaderRef.current();
      if (mounted.current && generation === requestGeneration.current) {
        setRows([...nextRows]);
      }
      return true;
    } catch (loadError) {
      if (mounted.current && generation === requestGeneration.current) {
        setError(errorMessageRef.current(loadError));
      }
      return false;
    } finally {
      if (mounted.current && generation === requestGeneration.current) {
        setPhase("idle");
      }
    }
  }, []);

  const reload = useCallback(() => load("loading"), [load]);
  const refresh = useCallback(() => load("refreshing"), [load]);

  const runMutation = useCallback(async (
    mutation: () => Promise<void>,
    mutationOptions: FrameworkListMutationOptions = {},
  ) => {
    if (mounted.current) {
      setMutating(true);
      setError(null);
    }
    try {
      await mutation();
      if (mutationOptions.reload !== false) await load("refreshing");
      return true;
    } catch (mutationError) {
      if (mounted.current) setError(errorMessageRef.current(mutationError));
      return false;
    } finally {
      if (mounted.current) setMutating(false);
    }
  }, [load]);

  return {
    rows,
    loading: phase === "loading",
    refreshing: phase === "refreshing",
    mutating,
    error,
    reload,
    refresh,
    runMutation,
    setRows,
    clearError: () => setError(null),
  };
}

/** Shared search projection for native pickers and other static lists. */
export function filterFrameworkListRows<T>(
  rows: readonly T[],
  query: string,
  searchableValues: (row: T) => readonly unknown[],
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => searchableValues(row).some((value) =>
    String(value ?? "").toLocaleLowerCase().includes(needle),
  ));
}

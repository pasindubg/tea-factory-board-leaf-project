export type DetailStateStep = {
  key: string;
  label: string;
  metric: string;
};

export type DetailStateModel = {
  steps: DetailStateStep[];
  current: DetailStateStep | null;
  currentIndex: number;
  progress: number;
};

/**
 * Normalizes a page-specific lifecycle into the shared detail indicator model.
 * Unknown persisted states deliberately fall back to the first declared step so
 * a detail page remains usable while its domain adapter surfaces the discrepancy.
 */
export function getDetailStateModel(
  steps: DetailStateStep[],
  currentKey: string | null | undefined,
): DetailStateModel {
  if (steps.length === 0) {
    return { steps, current: null, currentIndex: -1, progress: 0 };
  }

  const matchedIndex = steps.findIndex((step) => step.key === currentKey);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;

  return {
    steps,
    current: steps[currentIndex] ?? null,
    currentIndex,
    progress: ((currentIndex + 1) / steps.length) * 100,
  };
}

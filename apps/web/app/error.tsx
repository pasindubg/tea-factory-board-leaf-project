"use client";

export default function RootError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isNetwork =
    error.message.includes("fetch failed") ||
    error.message.includes("network") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("Could not verify your session");

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-8 dark:bg-stone-950">
      <div className="max-w-md text-center">
        {isNetwork ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <span className="text-3xl">📡</span>
            </div>
            <h1 className="text-lg font-semibold text-stone-800 dark:text-stone-200">
              Connection lost
            </h1>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              Could not reach the server. Check your internet connection and try again.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <span className="text-3xl">⚠️</span>
            </div>
            <h1 className="text-lg font-semibold text-stone-800 dark:text-stone-200">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              {error.message || "An unexpected error occurred."}
            </p>
          </>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-md bg-green-700 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

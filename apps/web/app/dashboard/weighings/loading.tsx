export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-md bg-stone-200" />
        <div className="h-9 w-36 rounded-md bg-stone-200" />
      </div>
      <div className="mt-6 flex flex-wrap items-end gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-16 rounded bg-stone-200" />
            <div className="h-8 w-36 rounded-md bg-stone-200" />
          </div>
        ))}
        <div className="h-8 w-16 rounded-md bg-stone-200" />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <div className="border-b border-stone-200 dark:border-stone-700 px-4 py-3">
          <div className="flex gap-12">
            {["w-12", "w-24", "w-20", "w-20", "w-16"].map((w, i) => (
              <div key={i} className={`h-3 ${w} rounded bg-stone-100 dark:bg-stone-800`} />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-12 border-b border-stone-100 dark:border-stone-800 px-4 py-3 last:border-0">
            <div className="h-4 w-12 rounded bg-stone-200" />
            <div className="h-4 w-28 rounded bg-stone-200" />
            <div className="h-4 w-24 rounded bg-stone-200" />
            <div className="ml-auto h-4 w-16 rounded bg-stone-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

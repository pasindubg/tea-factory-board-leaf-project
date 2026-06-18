export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <div className="h-3 w-12 rounded bg-stone-200" />
            <div className="h-8 w-32 rounded-md bg-stone-200" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-10 rounded bg-stone-200" />
            <div className="h-8 w-24 rounded-md bg-stone-200" />
          </div>
          <div className="h-8 w-16 rounded-md bg-stone-200" />
        </div>
        <div className="h-9 w-48 rounded-md bg-stone-200" />
      </div>
      <div className="mt-4 h-3 w-96 rounded bg-stone-200" />
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <div className="flex gap-8">
            {["w-24", "w-16", "w-20", "w-24", "w-20", "w-16", "w-16"].map((w, i) => (
              <div key={i} className={`h-3 ${w} rounded bg-stone-100`} />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-8 border-b border-stone-100 px-4 py-3 last:border-0">
            <div className="h-4 w-28 rounded bg-stone-200" />
            <div className="h-4 w-14 rounded bg-stone-200" />
            <div className="h-4 w-20 rounded bg-stone-200" />
            <div className="h-4 w-20 rounded bg-stone-200" />
            <div className="h-4 w-20 rounded bg-stone-200" />
            <div className="h-5 w-16 rounded-full bg-stone-200" />
            <div className="ml-auto flex gap-4">
              <div className="h-4 w-16 rounded bg-stone-200" />
              <div className="h-4 w-16 rounded bg-stone-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

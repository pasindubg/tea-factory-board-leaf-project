import Link from "next/link";

type GrnParsedJson = { parserStatus?: string; mimeType?: string; size?: number } | null;

function fileSize(bytes: number | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GrnContent({
  saleId,
  parsedJson,
}: {
  saleId: string;
  parsedJson: unknown;
}) {
  const parsed = parsedJson as GrnParsedJson;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Goods received note</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {parsed?.mimeType ?? "unknown type"} · {fileSize(parsed?.size)}
        </p>
      </div>
      <p className="rounded-md bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm text-stone-600 dark:text-stone-300">
        The GRN is a stored receiving record with no per-lot reconciliation of its own — it&apos;s what moved this broker invoice to the GRN stage.{" "}
        <Link href={`/dashboard/auction/${saleId}`} className="text-green-700 dark:text-green-400 hover:underline">
          View the broker invoice
        </Link>
        .
      </p>
    </div>
  );
}

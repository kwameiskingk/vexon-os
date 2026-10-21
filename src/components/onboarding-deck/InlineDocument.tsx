// A PDF read inside the card (Marcus, 8 Sep: "embedded, not a pop-out").
// The caller signs the URL; this only renders it, tall enough to read.

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineDocument({ title, url, loading, error, className }: {
  title: string;
  url: string | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full h-[60vh] min-h-[380px] overflow-hidden rounded-2xl border border-violet-100 bg-[#fafafa]", className)}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        </div>
      ) : error ? (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
        </div>
      ) : url ? (
        <iframe src={url} title={title} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="text-sm text-muted-foreground max-w-sm">The document has not been added yet.</p>
        </div>
      )}
    </div>
  );
}

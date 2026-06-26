import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "pending" | "in_progress" | "complete" | "error";

const styles: Record<Status, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};
const labels: Record<Status, string> = {
  pending: "Pending",
  in_progress: "Marking…",
  complete: "Complete",
  error: "Error",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {status === "in_progress" && <Loader2 className="h-3 w-3 animate-spin" />}
      {labels[status]}
    </span>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listDraftVersions, restoreDraftVersion } from "@/lib/submissions.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function DraftHistoryDialog({
  submissionId,
  sessionId,
  open,
  onOpenChange,
}: {
  submissionId: string | null;
  sessionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listDraftVersions);
  const restore = useServerFn(restoreDraftVersion);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["drafts", submissionId],
    queryFn: () => list({ data: { submissionId: submissionId! } }),
    enabled: !!submissionId && open,
  });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) =>
      restore({ data: { submissionId: submissionId!, versionId } }),
    onSuccess: () => {
      toast.success("Draft restored");
      qc.invalidateQueries({ queryKey: ["subs", sessionId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Draft history</DialogTitle>
          <DialogDescription>
            Every AI run and restore is kept here. Restore brings an old draft back as the current one.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {q.isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {q.data && q.data.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No previous versions yet. Re-marking or restoring will create entries here.
            </p>
          )}
          <ul className="space-y-3">
            {(q.data ?? []).map((v: any) => {
              const isOpen = expandedId === v.id;
              return (
                <li key={v.id} className="rounded-md border bg-background">
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.label ?? "Version"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isOpen ? null : v.id)}
                      >
                        {isOpen ? "Hide" : "Show"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreMut.mutate(v.id)}
                        disabled={restoreMut.isPending}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Restore
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="space-y-3 border-t p-3 text-xs">
                      {v.system_prompt_used && (
                        <div>
                          <p className="mb-1 font-medium">System prompt used</p>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                            {v.system_prompt_used}
                          </pre>
                        </div>
                      )}
                      {v.context_used && (
                        <div>
                          <p className="mb-1 font-medium">Context used</p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                            {v.context_used}
                          </pre>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 font-medium">Draft</p>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                          {v.draft_markdown}
                        </pre>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

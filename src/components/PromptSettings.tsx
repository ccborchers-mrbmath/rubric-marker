import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSessionPrompt } from "@/lib/sessions.functions";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/default-prompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, RotateCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function PromptSettings({
  sessionId,
  initialSystemPrompt,
  initialContextPrompt,
}: {
  sessionId: string;
  initialSystemPrompt: string | null;
  initialContextPrompt: string | null;
}) {
  const qc = useQueryClient();
  const save = useServerFn(updateSessionPrompt);
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState(initialSystemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const [ctx, setCtx] = useState(initialContextPrompt ?? "");

  useEffect(() => {
    setSystem(initialSystemPrompt ?? DEFAULT_SYSTEM_PROMPT);
    setCtx(initialContextPrompt ?? "");
  }, [initialSystemPrompt, initialContextPrompt]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: sessionId,
          systemPrompt: system.trim() === DEFAULT_SYSTEM_PROMPT.trim() ? null : system,
          contextPrompt: ctx.trim() ? ctx : null,
        },
      }),
    onSuccess: () => {
      toast.success("Prompt saved. Re-mark a student to apply.");
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">Marking prompt</p>
              <p className="text-xs text-muted-foreground">
                The exact instructions sent to the AI. Refine, save, then re-mark to see the impact.
              </p>
            </div>
          </div>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {open && (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">System prompt (the AI's role & output format)</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSystem(DEFAULT_SYSTEM_PROMPT)}
                  title="Reset to default"
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Reset
                </Button>
              </div>
              <Textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                rows={14}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                Use <code>{"{studentName}"}</code> to insert the student's name.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Additional context (appended to every request)</label>
              <Textarea
                value={ctx}
                onChange={(e) => setCtx(e.target.value)}
                rows={4}
                placeholder="Tone, focus areas, common pitfalls, year group…"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
                <Save className="mr-1.5 h-4 w-4" />
                {mut.isPending ? "Saving…" : "Save prompt"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

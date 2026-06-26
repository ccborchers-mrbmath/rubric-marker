import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { spellcheckDraft, rewriteSelection } from "@/lib/marking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, SpellCheck, Wand2 } from "lucide-react";

export function DocxEditor({
  submissionId,
  value,
  onChange,
}: {
  submissionId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const spellFn = useServerFn(spellcheckDraft);
  const rewriteFn = useServerFn(rewriteSelection);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const [spelling, setSpelling] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [rewrite, setRewrite] = useState<{
    selection: string;
    start: number;
    end: number;
    instruction: string;
    loading: boolean;
  } | null>(null);

  const wc = value.trim() ? value.trim().split(/\s+/).length : 0;

  async function onSpellcheck() {
    if (!value.trim()) return;
    setSpelling(true);
    try {
      const r = await spellFn({ data: { id: submissionId, text: value } });
      onChange(r.text);
      toast.success("Spelling & grammar checked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Spellcheck failed");
    } finally {
      setSpelling(false);
    }
  }

  function openRewrite() {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (start === end) {
      toast.error("Select some text first");
      return;
    }
    const selection = value.slice(start, end);
    if (!selection.trim()) {
      toast.error("Select some text first");
      return;
    }
    setRewrite({ selection, start, end, instruction: "", loading: false });
  }

  async function runRewrite() {
    if (!rewrite) return;
    if (value.slice(rewrite.start, rewrite.end) !== rewrite.selection) {
      toast.error("The draft changed since you opened this. Reselect and try again.");
      setRewrite(null);
      return;
    }
    setRewrite({ ...rewrite, loading: true });
    try {
      const r = await rewriteFn({
        data: {
          id: submissionId,
          fullText: value,
          selection: rewrite.selection,
          instruction: rewrite.instruction.trim() || undefined,
        },
      });
      const next =
        value.slice(0, rewrite.start) + r.text + value.slice(rewrite.end);
      onChange(next);
      toast.success("Selection rewritten");
      setRewrite(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rewrite failed");
      setRewrite((s) => (s ? { ...s, loading: false } : s));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSpellcheck}
            disabled={spelling || !value.trim()}
          >
            {spelling ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <SpellCheck className="mr-1.5 h-3.5 w-3.5" />
            )}
            Spelling &amp; grammar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openRewrite}
            title="Select text in the draft, then click"
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Rewrite selection
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {wc} word{wc === 1 ? "" : "s"}
          {sel.start !== sel.end ? ` · ${sel.end - sel.start} selected` : ""}
        </p>
      </div>

      <div className="flex justify-center overflow-auto rounded-md bg-muted/40 p-4 sm:p-6">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={(e) => {
            const t = e.currentTarget;
            setSel({
              start: t.selectionStart ?? 0,
              end: t.selectionEnd ?? 0,
            });
          }}
          spellCheck
          className="docx-page min-h-[60vh] w-full max-w-[8.5in] resize-y rounded-sm bg-white px-[1in] py-[1in] text-[#1a1a1a] shadow-md ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-primary/40"
          style={{
            fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif",
            fontSize: "11pt",
            lineHeight: 1.5,
          }}
        />
      </div>

      <Dialog
        open={!!rewrite}
        onOpenChange={(v) => !v && !rewrite?.loading && setRewrite(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rewrite selection</DialogTitle>
            <DialogDescription>
              The AI will rewrite only the selected passage. Optional: tell it
              how (e.g. "more concise", "warmer tone", "add specific evidence").
            </DialogDescription>
          </DialogHeader>
          {rewrite && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Selected text
                </p>
                <p className="line-clamp-6 whitespace-pre-wrap">
                  {rewrite.selection}
                </p>
              </div>
              <Input
                autoFocus
                placeholder="Optional instruction (or leave blank)"
                value={rewrite.instruction}
                onChange={(e) =>
                  setRewrite({ ...rewrite, instruction: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !rewrite.loading) runRewrite();
                }}
                disabled={rewrite.loading}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRewrite(null)}
              disabled={rewrite?.loading}
            >
              Cancel
            </Button>
            <Button onClick={runRewrite} disabled={rewrite?.loading}>
              {rewrite?.loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Rewriting…
                </>
              ) : (
                <>
                  <Wand2 className="mr-1.5 h-4 w-4" /> Rewrite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

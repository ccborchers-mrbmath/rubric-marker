import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import TurndownService from "turndown";
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
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  SpellCheck,
  Wand2,
} from "lucide-react";

const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

function mdToHtml(md: string): string {
  return marked.parse(md ?? "", { async: false, gfm: true, breaks: false }) as string;
}
function htmlToMd(html: string): string {
  return td.turndown(html ?? "").trim();
}

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
  const lastEmittedMd = useRef<string>(value);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: mdToHtml(value),
    editorProps: {
      attributes: {
        class:
          "docx-page min-h-[60vh] w-full max-w-[8.5in] bg-white px-[1in] py-[1in] text-[#1a1a1a] shadow-md ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-primary/40 rounded-sm prose prose-sm max-w-none prose-headings:text-[#1f3864] prose-headings:font-semibold prose-h1:text-[22pt] prose-h2:text-[16pt] prose-h3:text-[13pt] prose-p:my-2 prose-strong:text-[#1a1a1a]",
        style:
          "font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5;",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      const md = htmlToMd(editor.getHTML());
      lastEmittedMd.current = md;
      onChange(md);
    },
  });

  // External value changes (e.g. spellcheck result) → re-render editor.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedMd.current) return;
    lastEmittedMd.current = value;
    editor.commands.setContent(mdToHtml(value), { emitUpdate: false });
  }, [value, editor]);

  const [spelling, setSpelling] = useState(false);
  const [rewrite, setRewrite] = useState<{
    selection: string;
    from: number;
    to: number;
    instruction: string;
    loading: boolean;
  } | null>(null);

  const wc = value.trim() ? value.replace(/[#*_>`-]/g, " ").trim().split(/\s+/).length : 0;

  async function onSpellcheck() {
    if (!value.trim()) return;
    setSpelling(true);
    try {
      const r = await spellFn({ data: { id: submissionId, text: value } });
      onChange(r.text);
      if (editor) {
        lastEmittedMd.current = r.text;
        editor.commands.setContent(mdToHtml(r.text), { emitUpdate: false });
      }
      toast.success("Spelling & grammar checked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Spellcheck failed");
    } finally {
      setSpelling(false);
    }
  }

  function openRewrite() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      toast.error("Select some text first");
      return;
    }
    const selection = editor.state.doc.textBetween(from, to, "\n");
    if (!selection.trim()) {
      toast.error("Select some text first");
      return;
    }
    setRewrite({ selection, from, to, instruction: "", loading: false });
  }

  async function runRewrite() {
    if (!rewrite || !editor) return;
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
      editor
        .chain()
        .focus()
        .insertContentAt({ from: rewrite.from, to: rewrite.to }, r.text)
        .run();
      toast.success("Selection rewritten");
      setRewrite(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rewrite failed");
      setRewrite((s) => (s ? { ...s, loading: false } : s));
    }
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `h-8 px-2 ${active ? "bg-accent text-accent-foreground" : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("heading", { level: 1 }))}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("heading", { level: 2 }))}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("heading", { level: 3 }))}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("bold"))}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("italic"))}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("bulletList"))}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bulleted list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={btn(editor.isActive("orderedList"))}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
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
          <Button variant="ghost" size="sm" onClick={openRewrite}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Rewrite selection
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {wc} word{wc === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex justify-center overflow-auto rounded-md bg-muted/40 p-4 sm:p-6">
        <EditorContent editor={editor} className="w-full max-w-[8.5in]" />
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

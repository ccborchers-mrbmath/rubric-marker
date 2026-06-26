import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { previewSubmission } from "@/lib/submissions.functions";
import { getSignedUrl } from "@/lib/sessions.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Mode =
  | { kind: "submission"; id: string; title: string }
  | { kind: "storage"; path: string; mime: string; title: string };

export function PreviewModal({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode | null;
}) {
  const preview = useServerFn(previewSubmission);
  const signed = useServerFn(getSignedUrl);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    url: string;
    mime: string;
    html: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !mode) {
      setData(null);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        if (mode.kind === "submission") {
          const r = await preview({ data: { id: mode.id } });
          setData({ url: r.url, mime: r.mime, html: r.html });
        } else {
          const r = await signed({ data: { path: mode.path } });
          setData({ url: r.url, mime: mode.mime, html: null });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, mode, preview, signed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle className="truncate">{mode?.title ?? "Preview"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded border bg-muted/30">
          {loading || !data ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preview…
            </div>
          ) : data.html ? (
            <div
              className="prose prose-sm max-w-none h-full overflow-auto bg-background p-6 dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: data.html }}
            />
          ) : data.mime.startsWith("image/") ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-background p-4">
              <img src={data.url} alt="preview" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <iframe src={data.url} className="h-full w-full bg-background" title="preview" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

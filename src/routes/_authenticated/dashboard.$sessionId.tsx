import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Fragment as FragmentWithKey, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/sessions.functions";
import {
  listSubmissions,
  registerSubmission,
  updateDraft,
  downloadAssessment,
  deleteSubmission,
} from "@/lib/submissions.functions";
import { markSubmission } from "@/lib/marking.functions";
import { uploadToBucket, nameFromFilename, formatStudentName } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { PreviewModal } from "@/components/PreviewModal";
import { DocxEditor } from "@/components/DocxEditor";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/$sessionId")({
  head: () => ({ meta: [{ title: "Marking dashboard — MarkMate" }] }),
  component: DashboardPage,
});

type PreviewMode =
  | { kind: "submission"; id: string; title: string }
  | { kind: "storage"; path: string; mime: string; title: string };

function DashboardPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchSession = useServerFn(getSession);
  const fetchSubs = useServerFn(listSubmissions);
  const register = useServerFn(registerSubmission);
  const mark = useServerFn(markSubmission);
  const update = useServerFn(updateDraft);
  const dl = useServerFn(downloadAssessment);
  const del = useServerFn(deleteSubmission);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<PreviewMode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => fetchSession({ data: { id: sessionId } }),
  });

  const subs = useQuery({
    queryKey: ["subs", sessionId],
    queryFn: () => fetchSubs({ data: { sessionId } }),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (Array.isArray(data) && data.some((s) => s.marking_status === "in_progress")) {
        return 3000;
      }
      return false;
    },
  });

  // Sync drafts from server when not editing
  useEffect(() => {
    if (!subs.data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of subs.data) {
        if (next[s.id] === undefined && s.draft_markdown) {
          next[s.id] = s.draft_markdown;
        }
      }
      return next;
    });
  }, [subs.data]);

  const markMut = useMutation({
    mutationFn: (id: string) => mark({ data: { id } }),
    onMutate: () => {
      qc.invalidateQueries({ queryKey: ["subs", sessionId] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subs", sessionId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Marking failed"),
  });

  async function onBulkUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const arr = Array.from(files);
    setUploading(true);
    const t = toast.loading(`Uploading ${arr.length} file${arr.length > 1 ? "s" : ""}…`);
    let ok = 0;
    for (const f of arr) {
      try {
        const { path, mime } = await uploadToBucket({
          userId: u.user.id,
          folder: `sessions/${sessionId}`,
          file: f,
        });
        await register({
          data: {
            sessionId,
            studentName: nameFromFilename(f.name),
            filePath: path,
            fileName: f.name,
            mimeType: mime,
          },
        });
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    await qc.refetchQueries({ queryKey: ["subs", sessionId] });
    toast.dismiss(t);
    if (ok > 0) toast.success(`Uploaded ${ok} submission${ok > 1 ? "s" : ""}`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onMarkAllPending() {
    const pending = (subs.data ?? []).filter((s) => s.marking_status === "pending");
    if (pending.length === 0) {
      toast.info("Nothing pending");
      return;
    }
    setMarkAllLoading(true);
    toast.info(`Marking ${pending.length} submission${pending.length > 1 ? "s" : ""}…`);
    // Sequential to avoid hammering the gateway
    for (const s of pending) {
      try {
        await mark({ data: { id: s.id } });
      } catch (e) {
        toast.error(`${s.student_name}: ${e instanceof Error ? e.message : "failed"}`);
      }
      qc.invalidateQueries({ queryKey: ["subs", sessionId] });
    }
    setMarkAllLoading(false);
  }

  async function onSaveDraft(id: string) {
    try {
      await update({ data: { id, draft: drafts[id] ?? "" } });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onDownload(id: string, studentName: string) {
    // save latest draft first
    if (drafts[id] !== undefined) {
      await update({ data: { id, draft: drafts[id] } });
    }
    const res = await dl({ data: { id } });
    const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.filename || `${studentName}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this submission?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["subs", sessionId] });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/sessions">
                <ArrowLeft className="mr-1 h-4 w-4" /> All sessions
              </Link>
            </Button>

            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <GraduationCap className="h-4 w-4" />
              </div>
              <span className="font-semibold">MarkMate</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{session.data?.name ?? "Session"}</h1>
            <p className="text-sm text-muted-foreground">
              {subs.data?.length ?? 0} student
              {(subs.data?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            {session.data && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPreview({
                      kind: "storage",
                      path: session.data!.rubric_path,
                      mime: session.data!.rubric_mime,
                      title: "Rubric",
                    })
                  }
                >
                  <ClipboardList className="mr-1.5 h-4 w-4" /> Rubric
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPreview({
                      kind: "storage",
                      path: session.data!.brief_path,
                      mime: session.data!.brief_mime,
                      title: "Task brief",
                    })
                  }
                >
                  <FileText className="mr-1.5 h-4 w-4" /> Brief
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Add student submissions</p>
              <p className="text-xs text-muted-foreground">
                PDF, Word, or image. Student name comes from the filename.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,image/*"
                className="hidden"
                onChange={(e) => onBulkUpload(e.target.files)}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <Button onClick={onMarkAllPending} disabled={markAllLoading}>
                {markAllLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Mark all pending
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(subs.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No submissions yet. Upload some to get started.
                  </TableCell>
                </TableRow>
              )}
              {(subs.data ?? []).map((s) => {
                const isOpen = expanded[s.id] && s.marking_status === "complete";
                return (
                  <FragmentWithKey key={s.id}>
                    <TableRow>

                      <TableCell className="font-medium">{formatStudentName(s.student_name)}</TableCell>
                      <TableCell>
                        <button
                          onClick={() =>
                            setPreview({
                              kind: "submission",
                              id: s.id,
                              title: `${s.student_name} — ${s.file_name}`,
                            })
                          }
                          className="text-left text-sm text-primary underline-offset-2 hover:underline"
                        >
                          {s.file_name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <StatusPill status={s.marking_status} />
                        {s.marking_status === "error" && s.error_message && (
                          <p className="mt-1 max-w-xs truncate text-xs text-red-600">
                            {s.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setPreview({
                                kind: "submission",
                                id: s.id,
                                title: `${s.student_name} — ${s.file_name}`,
                              })
                            }
                            title="Preview submission"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {s.marking_status !== "in_progress" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={markMut.isPending && markMut.variables === s.id}
                              onClick={() => markMut.mutate(s.id)}
                              title={s.marking_status === "complete" ? "Re-mark" : "Mark"}
                            >
                              {markMut.isPending && markMut.variables === s.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {s.marking_status === "complete" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExpanded((p) => ({ ...p, [s.id]: !p[s.id] }))
                                }
                              >
                                {isOpen ? "Hide" : "Review"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDownload(s.id, s.student_name)}
                                title="Download Word"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(s.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-muted/40">
                          <div className="space-y-2 p-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              AI-generated assessment — edit inline, save, then download.
                            </p>
                            <DocxEditor
                              submissionId={s.id}
                              value={drafts[s.id] ?? s.draft_markdown ?? ""}
                              onChange={(v) => setDrafts((p) => ({ ...p, [s.id]: v }))}
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => onSaveDraft(s.id)}>
                                Save
                              </Button>
                              <Button size="sm" onClick={() => onDownload(s.id, s.student_name)}>
                                <Download className="mr-1.5 h-4 w-4" /> Download .docx
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentWithKey>

                );
              })}
            </TableBody>
          </Table>
        </Card>
      </main>

      <PreviewModal open={!!preview} onOpenChange={(v) => !v && setPreview(null)} mode={preview} />
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createSession } from "@/lib/sessions.functions";
import { uploadToBucket } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, GraduationCap, LogOut, FileText, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "New marking session — MarkMate" }] }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const create = useServerFn(createSession);
  const [name, setName] = useState("");
  const [rubric, setRubric] = useState<File | null>(null);
  const [brief, setBrief] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rubric || !brief) {
      toast.error("Upload both a rubric and a task brief");
      return;
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const [r, b] = await Promise.all([
        uploadToBucket({ userId: u.user.id, folder: "rubrics", file: rubric }),
        uploadToBucket({ userId: u.user.id, folder: "briefs", file: brief }),
      ]);
      const res = await create({
        data: {
          name: name.trim(),
          rubricPath: r.path,
          rubricMime: r.mime,
          briefPath: b.path,
          briefMime: b.mime,
          contextPrompt: context.trim() || null,
        },
      });
      toast.success("Session created");
      navigate({ to: "/dashboard/$sessionId", params: { sessionId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
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


      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">New marking session</h1>
          <p className="text-sm text-muted-foreground">
            Upload the rubric and task brief. These stay attached to this session.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Session details</CardTitle>
            <CardDescription>You can mark any number of students in this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="name">Session name</Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g. Year 10 — Essay on Macbeth"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FileField
                  icon={<ClipboardList className="h-4 w-4" />}
                  label="Rubric"
                  hint="PDF or image"
                  accept=".pdf,image/*"
                  file={rubric}
                  onChange={setRubric}
                />
                <FileField
                  icon={<FileText className="h-4 w-4" />}
                  label="Task brief"
                  hint="PDF or image"
                  accept=".pdf,image/*"
                  file={brief}
                  onChange={setBrief}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ctx">Additional context (optional)</Label>
                <Textarea
                  id="ctx"
                  rows={4}
                  placeholder="Anything else the AI should know: tone, focus areas, target year group, common pitfalls…"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={busy} size="lg" className="w-full">
                {busy ? "Creating…" : "Save & continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FileField(props: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {props.icon} {props.label}
      </Label>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-background px-4 py-6 text-center text-sm hover:bg-accent">
        <input
          type="file"
          className="hidden"
          accept={props.accept}
          onChange={(e) => props.onChange(e.target.files?.[0] ?? null)}
        />
        {props.file ? (
          <>
            <span className="font-medium">{props.file.name}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">Click to replace</span>
          </>
        ) : (
          <>
            <span className="font-medium">Click to upload</span>
            <span className="mt-0.5 text-xs text-muted-foreground">{props.hint}</span>
          </>
        )}
      </label>
    </div>
  );
}

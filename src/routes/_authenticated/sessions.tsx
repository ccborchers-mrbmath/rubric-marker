import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSessions, deleteSession } from "@/lib/sessions.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { toast } from "sonner";
import {
  ArrowRight,
  FilePlus2,
  GraduationCap,
  Loader2,
  LogOut,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({ meta: [{ title: "Your marking sessions — MarkMate" }] }),
  component: SessionsPage,
});

function SessionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchSessions = useServerFn(listSessions);
  const removeSession = useServerFn(deleteSession);

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => fetchSessions(),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => removeSession({ data: { id } }),
    onSuccess: () => {
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/sessions" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-semibold">MarkMate</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Your marking sessions</h1>
            <p className="text-sm text-muted-foreground">
              Resume an in-progress session or start a new one.
            </p>
          </div>
          <Button asChild>
            <Link to="/setup">
              <FilePlus2 className="mr-1.5 h-4 w-4" /> New session
            </Link>
          </Button>
        </div>

        {sessions.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (sessions.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                You haven't created any sessions yet.
              </p>
              <Button asChild>
                <Link to="/setup">
                  <FilePlus2 className="mr-1.5 h-4 w-4" /> Create your first session
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {(sessions.data ?? []).map((s) => {
              const c = s.counts;
              const progressLabel =
                c.total === 0
                  ? "No submissions yet"
                  : `${c.complete}/${c.total} marked`;
              return (
                <Card key={s.id} className="transition hover:shadow-sm">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <Link
                      to="/dashboard/$sessionId"
                      params={{ sessionId: s.id }}
                      className="flex-1 min-w-0"
                    >
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Last updated {formatWhen(s.updated_at)} · {progressLabel}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.in_progress > 0 && (
                          <StatusPill status="in_progress" />
                        )}
                        {c.pending > 0 && <StatusPill status="pending" />}
                        {c.complete > 0 && <StatusPill status="complete" />}
                        {c.errored > 0 && <StatusPill status="error" />}
                      </div>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Button asChild size="sm">
                        <Link
                          to="/dashboard/$sessionId"
                          params={{ sessionId: s.id }}
                        >
                          Resume <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete session"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${s.name}"? This removes all submissions and files in this session.`,
                            )
                          ) {
                            delMut.mutate(s.id);
                          }
                        }}
                        disabled={delMut.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

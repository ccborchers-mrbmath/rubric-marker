import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, FileCheck2, Wand2, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MarkMate — AI-assisted assessment marking" },
      {
        name: "description",
        content:
          "Upload your rubric, bulk-mark student submissions with AI, edit drafts inline, and export polished Word feedback.",
      },
      { property: "og:title", content: "MarkMate — AI-assisted assessment marking" },
      {
        property: "og:description",
        content:
          "Upload your rubric, bulk-mark student submissions with AI, edit drafts inline, and export polished Word feedback.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">MarkMate</span>
        </div>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Mark assessments in minutes, not weeks.
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Upload your rubric and task brief once, drop in a batch of student submissions, and let AI
            draft criterion-by-criterion feedback. Review inline, refine, and export as Word.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started free</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: FileCheck2,
              title: "Set up once",
              body: "Upload your rubric, the task brief, and any extra marking guidance.",
            },
            {
              icon: Wand2,
              title: "Bulk AI marking",
              body: "Drop in a folder of student submissions. Names are detected automatically.",
            },
            {
              icon: Download,
              title: "Edit & export",
              body: "Refine drafts inline, then download polished Word documents per student.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

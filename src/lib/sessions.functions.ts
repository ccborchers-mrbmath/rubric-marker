import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateSessionInput = z.object({
  name: z.string().trim().min(1).max(200),
  rubricPath: z.string().min(1),
  rubricMime: z.string().min(1),
  briefPath: z.string().min(1),
  briefMime: z.string().min(1),
  contextPrompt: z.string().max(5000).optional().nullable(),
});

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSessionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("marking_sessions")
      .insert({
        user_id: userId,
        name: data.name,
        rubric_path: data.rubricPath,
        rubric_mime: data.rubricMime,
        brief_path: data.briefPath,
        brief_mime: data.briefMime,
        context_prompt: data.contextPrompt ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marking_sessions")
      .select("id,name,created_at,updated_at,submissions(marking_status)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => {
      const subs: { marking_status: string }[] = s.submissions ?? [];
      const total = subs.length;
      const complete = subs.filter((x) => x.marking_status === "complete").length;
      const inProgress = subs.filter((x) => x.marking_status === "in_progress").length;
      const pending = subs.filter((x) => x.marking_status === "pending").length;
      const errored = subs.filter((x) => x.marking_status === "error").length;
      return {
        id: s.id,
        name: s.name,
        created_at: s.created_at,
        updated_at: s.updated_at,
        counts: { total, complete, in_progress: inProgress, pending, errored },
      };
    });
  });


export const getSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("marking_sessions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ path: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("marking-files")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

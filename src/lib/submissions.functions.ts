import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterInput = z.object({
  sessionId: z.string().uuid(),
  studentName: z.string().trim().min(1).max(200),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export const registerSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify session belongs to user
    const { data: sess, error: sErr } = await supabase
      .from("marking_sessions")
      .select("id")
      .eq("id", data.sessionId)
      .single();
    if (sErr || !sess) throw new Error("Session not found");
    const { data: row, error } = await supabase
      .from("submissions")
      .insert({
        user_id: userId,
        session_id: data.sessionId,
        student_name: data.studentName,
        file_path: data.filePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("submissions")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("student_name");
    if (error) throw new Error(error.message);
    return rows;
  });

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), draft: z.string().max(100000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("submissions")
      .update({ draft_markdown: data.draft })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateStudentName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), studentName: z.string().trim().min(1).max(200) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("submissions")
      .update({ student_name: data.studentName })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("submissions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("submissions")
      .select("file_path,mime_type,file_name")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Not found");

    const { data: signed, error: sErr } = await supabase.storage
      .from("marking-files")
      .createSignedUrl(row.file_path, 60 * 60);
    if (sErr) throw new Error(sErr.message);

    let html: string | null = null;
    if (
      row.mime_type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      row.file_name.toLowerCase().endsWith(".docx")
    ) {
      const { data: blob, error: dErr } = await supabase.storage
        .from("marking-files")
        .download(row.file_path);
      if (dErr) throw new Error(dErr.message);
      const buf = Buffer.from(await blob.arrayBuffer());
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer: buf });
      html = result.value;
    }

    return {
      url: signed.signedUrl,
      mime: row.mime_type,
      fileName: row.file_name,
      html,
    };
  });

export const downloadAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("submissions")
      .select("student_name,draft_markdown")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Not found");
    if (!row.draft_markdown) throw new Error("No assessment yet");
    const { markdownToDocxBuffer } = await import("./docx.server");
    const buf = await markdownToDocxBuffer(row.draft_markdown);
    return {
      filename: `${row.student_name.replace(/[^a-z0-9-_ ]/gi, "_")} - Assessment.docx`,
      base64: buf.toString("base64"),
    };
  });

export const listDraftVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ submissionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("draft_versions")
      .select("id, created_at, label, draft_markdown, system_prompt_used, context_used")
      .eq("submission_id", data.submissionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const restoreDraftVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ submissionId: z.string().uuid(), versionId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ver, error: vErr } = await supabase
      .from("draft_versions")
      .select("draft_markdown")
      .eq("id", data.versionId)
      .eq("user_id", userId)
      .single();
    if (vErr || !ver) throw new Error("Version not found");

    // Archive current before restoring.
    const { data: cur } = await supabase
      .from("submissions")
      .select("draft_markdown")
      .eq("id", data.submissionId)
      .single();
    if (cur?.draft_markdown && cur.draft_markdown.trim()) {
      await supabase.from("draft_versions").insert({
        submission_id: data.submissionId,
        user_id: userId,
        draft_markdown: cur.draft_markdown,
        label: "Auto-saved before restore",
      });
    }

    const { error } = await supabase
      .from("submissions")
      .update({ draft_markdown: ver.draft_markdown, marking_status: "complete" })
      .eq("id", data.submissionId);
    if (error) throw new Error(error.message);
    return { ok: true, draft: ver.draft_markdown };
  });

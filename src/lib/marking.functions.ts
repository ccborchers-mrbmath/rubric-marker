import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function fileToBase64(
  supabase: ReturnType<typeof Object>,
  path: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).storage
    .from("marking-files")
    .download(path);
  if (error) throw new Error(error.message);
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function blockFor(mime: string, fileName: string, base64: string) {
  if (mime.startsWith("image/")) {
    return {
      type: "image_url" as const,
      image_url: { url: `data:${mime};base64,${base64}` },
    };
  }
  if (mime === DOCX_MIME || fileName.toLowerCase().endsWith(".docx")) {
    // Gemini doesn't accept .docx — extract text first.
    const mammoth = await import("mammoth");
    const buf = Buffer.from(base64, "base64");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return {
      type: "text" as const,
      text: `[Extracted text from ${fileName}]:\n${value}`,
    };
  }
  // PDF / others: send as file block
  return {
    type: "file" as const,
    file: {
      filename: fileName,
      file_data: `data:${mime};base64,${base64}`,
    },
  };
}

export const markSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: sub, error: sErr } = await supabase
      .from("submissions")
      .select("*, marking_sessions!inner(*)")
      .eq("id", data.id)
      .single();
    if (sErr || !sub) throw new Error("Submission not found");

    // mark in progress
    await supabase
      .from("submissions")
      .update({ marking_status: "in_progress", error_message: null })
      .eq("id", data.id);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = (sub as any).marking_sessions;
      const [rubricB64, briefB64, studentB64] = await Promise.all([
        fileToBase64(supabase, session.rubric_path),
        fileToBase64(supabase, session.brief_path),
        fileToBase64(supabase, sub.file_path),
      ]);

      const { callGateway } = await import("./ai-gateway.server");

      const systemPrompt = `You are an experienced examiner. You will be given:
1. A rubric defining marking criteria.
2. The assignment task brief.
3. Optional additional context from the teacher.
4. A student's submission.

Mark the submission strictly against the rubric. Output a structured assessment in Markdown with:
- "# Assessment for ${sub.student_name}"
- "## Criterion-by-Criterion Marks" — for each rubric criterion: name, score/grade, evidence, comment.
- "## Overall Mark" — overall grade or numeric score with brief justification.
- "## Strengths"
- "## Areas for Improvement"
- "## Summary Feedback" — 2-3 paragraph holistic feedback addressed to the student.

Use clear language. Do not invent rubric criteria; use those in the rubric verbatim.`;

      const userContent = [
        { type: "text" as const, text: "RUBRIC:" },
        blockFor(session.rubric_mime, "rubric", rubricB64),
        { type: "text" as const, text: "ASSIGNMENT TASK BRIEF:" },
        blockFor(session.brief_mime, "brief", briefB64),
        ...(session.context_prompt
          ? [
              {
                type: "text" as const,
                text: `ADDITIONAL TEACHER CONTEXT:\n${session.context_prompt}`,
              },
            ]
          : []),
        {
          type: "text" as const,
          text: `STUDENT SUBMISSION (student name: ${sub.student_name}):`,
        },
        blockFor(sub.mime_type, sub.file_name, studentB64),
        {
          type: "text" as const,
          text: "Now produce the structured Markdown assessment.",
        },
      ];

      const draft = await callGateway({
        apiKey,
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

      await supabase
        .from("submissions")
        .update({
          marking_status: "complete",
          draft_markdown: draft,
          error_message: null,
        })
        .eq("id", data.id);

      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("submissions")
        .update({ marking_status: "error", error_message: msg })
        .eq("id", data.id);
      throw new Error(msg);
    }
  });

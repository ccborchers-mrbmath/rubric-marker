import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_SYSTEM_PROMPT, renderSystemPrompt } from "./default-prompt";


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

      const [rubricBlock, briefBlock, studentBlock] = await Promise.all([
        blockFor(session.rubric_mime, "rubric", rubricB64),
        blockFor(session.brief_mime, "brief", briefB64),
        blockFor(sub.mime_type, sub.file_name, studentB64),
      ]);

      const userContent = [
        { type: "text" as const, text: "RUBRIC:" },
        rubricBlock,
        { type: "text" as const, text: "ASSIGNMENT TASK BRIEF:" },
        briefBlock,
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
        studentBlock,
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

export const spellcheckDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: sub, error } = await supabase
      .from("submissions")
      .select("id, student_name, user_id")
      .eq("id", data.id)
      .single();
    if (error || !sub) throw new Error("Submission not found");

    const { callGateway } = await import("./ai-gateway.server");
    const system = `You are a meticulous proofreader for an assessment draft written in Markdown. Fix ONLY spelling, grammar, punctuation, and minor typo errors. Do NOT rewrite, rephrase, restructure, expand, shorten, or change the meaning, tone, or content. Preserve the author's voice and word choices.

CRITICAL:
- The student's name is "${sub.student_name}". This is the AUTHORITATIVE spelling — never change it. Do not "correct" other proper nouns unless they are obvious typos.
- Preserve ALL Markdown formatting exactly: headings (#, ##, ###), bold (**), italics (*), lists (-, *, 1.), tables, blank lines, indentation.
- Return ONLY the corrected Markdown, with no preamble, no explanation, no code fences.`;

    const corrected = await callGateway({
      apiKey,
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: data.text },
      ],
    });
    const cleaned = corrected.trim();
    if (!cleaned) throw new Error("Empty response");

    await supabase
      .from("submissions")
      .update({ draft_markdown: cleaned })
      .eq("id", data.id);
    return { text: cleaned };
  });

export const rewriteSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fullText: z.string().min(1),
        selection: z.string().min(1),
        instruction: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    if (!data.fullText.includes(data.selection)) {
      throw new Error("Selection must appear in the draft");
    }

    const { data: sub, error } = await supabase
      .from("submissions")
      .select("id, student_name, marking_sessions!inner(context_prompt)")
      .eq("id", data.id)
      .single();
    if (error || !sub) throw new Error("Submission not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctxPrompt = (sub as any).marking_sessions?.context_prompt as
      | string
      | null;

    const { callGateway } = await import("./ai-gateway.server");

    const system = `You rewrite a SPECIFIC SELECTION inside an assessment draft written in Markdown for student "${sub.student_name}".
${ctxPrompt ? `\nTEACHER CONTEXT:\n${ctxPrompt}\n` : ""}
YOUR TASK:
- Rewrite ONLY the SELECTED TEXT below.
- The replacement must read naturally in place of the selection — keep similar length unless the user instruction asks otherwise.
- Preserve Markdown formatting style of the selection (e.g. if it's a bullet, return a bullet; if it's a heading line, return a heading line).
- Do NOT include the unchanged surrounding text in your output.
- Do NOT add quotes, labels, code fences, or commentary.
- Output ONLY the replacement text.
${data.instruction ? `\nUSER INSTRUCTION: ${data.instruction}` : ""}`;

    const user = `FULL DRAFT (for context — do NOT rewrite this whole thing):
"""
${data.fullText}
"""

SELECTED TEXT TO REWRITE:
"""
${data.selection}
"""

Return only the replacement for the selected text.`;

    const replacement = await callGateway({
      apiKey,
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = replacement.trim();
    if (!text) throw new Error("Empty response");
    return { text };
  });


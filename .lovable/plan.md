## AI-Assisted Assessment Marking System

A teacher-facing web app to bulk-mark student submissions against a rubric using Lovable AI, with inline editing and Word export.

### Stack
- TanStack Start + Tailwind + shadcn/ui
- Lovable Cloud (auth, Postgres, storage)
- Lovable AI Gateway (Gemini, multimodal — handles PDFs & images natively)
- `docx` npm package for Word export

### Auth
- Email/password + Google sign-in (via Lovable broker)
- Public `/auth` page; rest of app under `_authenticated/`

### Pages

**1. `/auth`** — sign-in / sign-up.

**2. `/setup`** — Create a marking session
- Upload rubric (PDF/image) → Cloud Storage
- Upload task brief (PDF/image) → Cloud Storage
- Optional context prompt (textarea)
- "Save & continue" → creates `marking_session` row, navigates to dashboard

**3. `/dashboard/$sessionId`** — Marking dashboard
- Header: session name, rubric/brief thumbnails (click to preview)
- Bulk-upload zone for student submissions (PDF/DOCX/images)
  - Filename (sans extension) → student name
- Table columns: Student • File • Submission status • Marking status (pending/in progress/complete/error) • Actions (Mark, Re-mark, Preview, Download)
- Click filename → modal with embedded preview:
  - PDF → `<iframe>` on signed URL
  - DOCX → server-side convert to HTML (mammoth) and render
  - Image → `<img>`
- "Mark all pending" button + per-row Mark button
- Each marked row expands to an inline editable rich-text panel showing the AI draft (textarea/contenteditable with markdown)
- Download button → generates `.docx` from current edited content

### Backend (server functions in `src/lib/*.functions.ts`)

- `createSession({ rubricPath, briefPath, contextPrompt })`
- `listSessions()`, `getSession(id)`
- `uploadSubmission` → client uploads to storage, then `registerSubmission({ sessionId, path, studentName })`
- `previewSubmission(submissionId)` → returns signed URL (+ HTML for docx via mammoth)
- `markSubmission(submissionId)` → 
  1. Loads rubric, brief, context, student doc as base64 from storage
  2. Calls Lovable AI (`google/gemini-3-flash-preview`) with multimodal content blocks + system prompt: "You are an examiner. Apply the rubric strictly. Output structured assessment: per-criterion score + comment, overall mark, summary feedback."
  3. Saves draft to `assessments.draft_markdown`, sets status complete
- `updateAssessment(id, markdown)` — inline edits
- `downloadAssessment(id)` → server fn returns base64 docx generated from markdown via `docx` package

### Schema (Lovable Cloud)
```
marking_sessions(id, user_id, name, rubric_path, brief_path, context_prompt, created_at)
submissions(id, session_id, student_name, file_path, mime_type, marking_status, created_at)
assessments(id, submission_id, draft_markdown, updated_at)
```
RLS: all rows scoped to `auth.uid() = user_id` (sessions); child tables join via session.

Storage buckets (private): `rubrics`, `briefs`, `submissions` — accessed via signed URLs only.

### UI / Design
- Clean neutral palette, generous whitespace, focused on the table
- Status pills: gray (pending), amber (in progress, with spinner), green (complete), red (error)
- Modal preview uses shadcn `Dialog`, full-height scrollable
- Inline editor: shadcn `Textarea` autosizing, with markdown preview toggle

### Out of scope (v1)
- Voice input (text only as requested)
- Multi-teacher collaboration
- Re-grading history / versioning

### Build order
1. Enable Lovable Cloud + auth pages + Google provider config
2. Schema + storage buckets + RLS
3. Setup page with uploads
4. Dashboard table + bulk upload + preview modal
5. AI marking server function + status streaming via polling/invalidation
6. Inline editor + Word download

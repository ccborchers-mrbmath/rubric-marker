// Client-side helper to upload a file to the user's folder in marking-files.
import { supabase } from "@/integrations/supabase/client";

function safeName(name: string) {
  return name.replace(/[^a-z0-9._-]/gi, "_");
}

export async function uploadToBucket(opts: {
  userId: string;
  folder: string;
  file: File;
}): Promise<{ path: string; mime: string }> {
  const ext = opts.file.name.includes(".")
    ? opts.file.name.slice(opts.file.name.lastIndexOf("."))
    : "";
  const path = `${opts.userId}/${opts.folder}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage
    .from("marking-files")
    .upload(path, opts.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: opts.file.type || "application/octet-stream",
    });
  if (error) throw new Error(error.message);
  return { path, mime: opts.file.type || "application/octet-stream" };
}

export function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return formatStudentName(cleaned);
}

export function formatStudentName(raw: string): string {
  const words = raw.trim().split(/\s+/);
  if (words.length < 2) return raw;
  const first = words[0];
  const last = words[1];
  return `${last}, ${first}`;
}

export { safeName };

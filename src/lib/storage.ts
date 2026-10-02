import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Supabase Storage (private bucket) in production; local ./.data/uploads in development.
const bucket = process.env.SUPABASE_BUCKET || 'fulfilment';
let client: SupabaseClient | null = null;
function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return client;
}
const localRoot = path.join(process.cwd(), '.data', 'uploads');

// Hosting platforms cap a request at ~4.5–6 MB. Photos are shrunk in the browser before upload.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

export function checkUpload(file: File): string | null {
  if (!file || file.size === 0) return 'Choose a file first.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 4 MB. Photos are shrunk automatically; for a big PDF, save it smaller first.';
  if (!ALLOWED.test(file.type)) return 'Upload a photo (JPG, PNG, HEIC) or a PDF.';
  return null;
}

export async function putFile(key: string, data: Buffer, mime: string) {
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from(bucket).upload(key, data, { contentType: mime, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  if (process.env.VERCEL || process.env.NETLIFY) throw new Error('File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const p = path.join(localRoot, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}

/** Either a short-lived signed URL to redirect to, or the bytes to stream. */
export async function getFile(key: string): Promise<{ url: string } | { data: Buffer }> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(key, 120);
    if (error || !data) throw new Error('File not found');
    return { url: data.signedUrl };
  }
  return { data: await readFile(path.join(localRoot, key)) };
}

export function storageKey(prefix: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

/** Deletes a stored file. Missing files are ignored. */
export async function removeFile(key: string) {
  if (!key) return;
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from(bucket).remove([key]);
    if (error) throw new Error(`Could not delete the file: ${error.message}`);
    return;
  }
  await rm(path.join(localRoot, key), { force: true });
}

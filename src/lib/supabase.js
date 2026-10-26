import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STALE_MS = 175000; // Supabase stops a function after ~150 s; a job with no progress for this long was cut off

/** Waits for a background AI job to finish, reporting its progress. Resolves to its result. */
export async function waitForJob(jobId, onProgress) {
  for (let i = 0; ; i++) {
    const { data, error } = await supabase.from("ai_jobs").select("status, progress, result, error, created_at, updated_at").eq("id", jobId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("The AI job disappeared. Try again.");
    if (data.status === "done") return data.result;
    if (data.status === "error") throw new Error(data.error || "The AI step failed. Try again.");
    if (Date.now() - Date.parse(data.updated_at || data.created_at) > STALE_MS) throw new Error("The AI took too long and was stopped. Try again in a minute.");
    if (data.progress && onProgress) onProgress(data.progress);
    await sleep(i < 5 ? 1500 : 2500);
  }
}

const RETRYABLE = /too long|busy|stopped|timed out|try again in a minute/i;

/** Runs an AI action as a background job and waits for it. Retries once if the AI was busy or slow. */
export async function ai(action, projectId, extra = {}, onProgress) {
  for (let attempt = 0; ; attempt++) {
    try {
      const { jobId } = await startAi(action, projectId, extra);
      onProgress?.(attempt ? "The AI was slow, so trying again…" : "Starting…");
      return await waitForJob(jobId, onProgress);
    } catch (e) {
      if (attempt === 0 && RETRYABLE.test(e.message || "")) { onProgress?.("The AI was slow, so trying again…"); await sleep(3000); continue; }
      throw e;
    }
  }
}

/** Calls the single "ai" edge function, which starts the job and replies with its id. Runs as the signed-in user, so row-level security applies. */
async function startAi(action, projectId, extra = {}) {
  const { data, error } = await supabase.functions.invoke("ai", { body: { action, projectId, ...extra } });
  if (error) {
    let msg = error.message || "The AI service didn't respond.";
    const res = error.context;
    if (res && typeof res.status === "number") {
      let text = "";
      try { text = await res.text(); } catch { /* ignore */ }
      let body = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      if (body && (body.error || body.message || body.msg)) msg = body.error || body.message || body.msg;
      else if (res.status === 504 || res.status === 546 || /timeout|timed out|wall clock|WORKER_LIMIT/i.test(text)) msg = `The AI step took too long or ran out of resources (error ${res.status}). Try again; if it keeps happening, check the "ai" function logs in Supabase.`;
      else if (res.status === 401) msg = "Your session expired. Sign out and sign in again.";
      else if (res.status === 404) msg = "The \"ai\" function isn't deployed in Supabase (error 404).";
      else msg = `The AI function failed (error ${res.status})${text ? ": " + text.slice(0, 200) : ""}`;
    }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = "Couldn't reach the AI function. Check it's deployed as \"ai\" in Supabase.";
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  if (!data || !data.jobId) throw new Error("The AI function is out of date. Paste the latest index.ts into Supabase and deploy it again.");
  return data;
}

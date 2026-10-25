import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

/** Calls the single "ai" edge function. It runs as the signed-in user, so row-level security applies. */
export async function ai(action, projectId, extra = {}) {
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
  return data;
}

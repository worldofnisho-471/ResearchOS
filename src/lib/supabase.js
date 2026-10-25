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
    try {
      const body = await error.context.json();
      if (body && body.error) msg = body.error;
    } catch { /* keep msg */ }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = "Couldn't reach the AI function. Check it's deployed as \"ai\" in Supabase.";
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

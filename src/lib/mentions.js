import { supabase } from "./supabase.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Project members who can be @mentioned: [{ id, name }] with a real display name. */
export function mentionable(members, name) {
  return members.map((m) => ({ id: m.user_id, name: name(m.user_id) })).filter((m) => m.name && m.name !== "Teammate" && m.name !== "Someone");
}

/** Ids of members whose "@Name" appears in the text (longest names first, so "@Ana Rao" beats "@Ana"). */
export function mentionedIds(text, people) {
  const ids = new Set();
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (new RegExp("(^|[^\\w])@" + esc(p.name) + "(?![\\w])", "i").test(text)) ids.add(p.id);
  }
  return [...ids];
}

/** Splits text into plain strings and { mention, id } parts for highlighting. */
export function splitMentions(text, people) {
  if (!people.length) return [text];
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  const re = new RegExp("@(" + sorted.map((p) => esc(p.name)).join("|") + ")(?![\\w])", "gi");
  const out = []; let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const p = sorted.find((x) => x.name.toLowerCase() === m[1].toLowerCase());
    out.push({ mention: "@" + p.name, id: p.id });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Lets a mentioned person's open app know straight away (their badge also re-checks on its own). */
export async function nudge(userIds) {
  for (const id of userIds) {
    const ch = supabase.channel("user:" + id);
    try { await ch.send({ type: "broadcast", event: "mention", payload: {} }); } catch { /* the badge re-checks anyway */ }
    supabase.removeChannel(ch);
  }
}

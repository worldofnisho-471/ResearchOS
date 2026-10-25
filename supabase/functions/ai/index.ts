// ResearchOS "ai" edge function: every AI and outside-data step, in one file.
// Deploy: Supabase dashboard > Edge Functions > Create function "ai" > paste this file,
// or `supabase functions deploy ai`. Secrets (Edge Functions > Secrets):
//   LLM_PROVIDER = gemini | anthropic
//   GEMINI_API_KEY (and optional GEMINI_MODEL) or ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL)
//   SEMANTIC_SCHOLAR_API_KEY (optional, raises rate limits), OPENALEX_API_KEY (needed for ORCID import and trends)
// The function acts as the signed-in user, so row-level security applies to every read and write.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const today = () => new Date().toISOString().slice(0, 10);

// ---------- LLM ----------
function parseJSON(text: string): any {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* try more */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* try more */ } }
  const a = Math.min(...["{", "["].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a < b) return JSON.parse(t.slice(a, b + 1));
  throw new Error("no JSON");
}

// Busy or rate-limited: worth waiting and retrying (with backoff) before giving up.
const BUSY = new Set([429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
async function fetchRetry(call: () => Promise<Response>, tries = 3): Promise<Response> {
  let r = await call();
  for (let i = 1; i < tries && BUSY.has(r.status); i++) {
    await r.body?.cancel();
    const wait = Number(r.headers.get("retry-after")) * 1000 || 1500 * 2 ** (i - 1);
    await sleep(Math.min(wait, 8000) + Math.random() * 400);
    r = await call();
  }
  return r;
}
function busyOr(r: Response, who: string, text: string) {
  if (BUSY.has(r.status)) return new HttpError(503, `${who} is busy right now (error ${r.status}). Wait a minute and try again.`);
  return new HttpError(502, `${who} error ${r.status}: ${text.slice(0, 300)}`);
}

async function llmText(prompt: string, search = false): Promise<string> {
  const provider = env("LLM_PROVIDER", env("GEMINI_API_KEY") ? "gemini" : "anthropic");
  if (provider === "gemini") {
    const key = env("GEMINI_API_KEY");
    if (!key) throw new HttpError(500, "GEMINI_API_KEY is not set in Supabase secrets.");
    const body: Record<string, unknown> = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
    if (search) body.tools = [{ google_search: {} }];
    else body.generationConfig = { responseMimeType: "application/json" };
    // Try the main model (with retries), then the optional fallback model.
    const models = [env("GEMINI_MODEL", "gemini-3.8-flash"), env("GEMINI_FALLBACK_MODEL")].filter(Boolean);
    let r: Response | null = null;
    for (const model of models) {
      r = await fetchRetry(() => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
      if (r.ok || !BUSY.has(r.status)) break;
    }
    if (!r!.ok) throw busyOr(r!, "Gemini", await r!.text());
    const d = await r!.json();
    return (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  }
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new HttpError(500, "ANTHROPIC_API_KEY is not set in Supabase secrets.");
  const body: Record<string, unknown> = {
    model: env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  };
  if (search) body.tools = [{ type: env("ANTHROPIC_WEB_SEARCH_TOOL", "web_search_20250305"), name: "web_search", max_uses: 6 }];
  const r = await fetchRetry(() => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!r.ok) throw busyOr(r, "Claude API", await r.text());
  const d = await r.json();
  return (d.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

async function llmJSON(prompt: string, search = false): Promise<any> {
  const full = prompt + "\n\nReply with only the JSON value, no other text.";
  let text = await llmText(full, search);
  try { return parseJSON(text); } catch {
    text = await llmText(full + "\nYour previous reply was not valid JSON. Return only valid JSON this time.", search);
    try { return parseJSON(text); } catch { throw new HttpError(502, "The AI reply wasn't in the expected format. Try again."); }
  }
}

// ---------- Outside data ----------
async function semanticScholar(query: string) {
  const headers: Record<string, string> = {};
  if (env("SEMANTIC_SCHOLAR_API_KEY")) headers["x-api-key"] = env("SEMANTIC_SCHOLAR_API_KEY");
  try {
    const u = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=8&fields=title,year,url,abstract`;
    const r = await fetch(u, { headers });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data ?? []).filter((p: any) => p.title).map((p: any) => ({
      title: p.title as string, year: p.year ?? null, url: p.url ?? null, abstract: (p.abstract ?? "").slice(0, 900),
    }));
  } catch { return []; }
}

function openalexKey() { const k = env("OPENALEX_API_KEY"); return k ? `&api_key=${encodeURIComponent(k)}` : ""; }

function invertedToText(inv: Record<string, number[]> | null | undefined) {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, idxs] of Object.entries(inv)) for (const i of idxs) words[i] = w;
  return words.join(" ").slice(0, 900);
}

async function openalexWorksByOrcid(orcid: string) {
  const u = `https://api.openalex.org/works?filter=author.orcid:${orcid}&per-page=50&sort=publication_year:desc&select=id,title,publication_year,doi,abstract_inverted_index,topics${openalexKey()}`;
  try {
    const r = await fetch(u);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results ?? []).filter((w: any) => w.title).map((w: any) => ({
      title: w.title as string, year: w.publication_year ?? null, doi_or_url: w.doi ?? w.id ?? "",
      abstract: invertedToText(w.abstract_inverted_index), topics: (w.topics ?? []).slice(0, 3).map((t: any) => t.display_name),
    }));
  } catch { return []; }
}

async function orcidPublicWorks(orcid: string) {
  try {
    const r = await fetch(`https://pub.orcid.org/v3.0/${orcid}/works`, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.group ?? []).map((g: any) => g["work-summary"]?.[0]).filter(Boolean).map((s: any) => {
      const doi = (s["external-ids"]?.["external-id"] ?? []).find((e: any) => e["external-id-type"] === "doi");
      return {
        title: s.title?.title?.value ?? "", year: Number(s["publication-date"]?.year?.value) || null,
        doi_or_url: doi ? `https://doi.org/${doi["external-id-value"]}` : (s.url?.value ?? ""), abstract: "", topics: [],
      };
    }).filter((w: any) => w.title);
  } catch { return []; }
}

async function openalexTrend(phrase: string) {
  const y = new Date().getFullYear();
  try {
    const r = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(phrase)}&filter=publication_year:${y - 6}-${y - 1}&group_by=publication_year${openalexKey()}`);
    if (!r.ok) return null;
    const d = await r.json();
    const rows = (d.group_by ?? []).map((g: any) => ({ year: Number(g.key), count: g.count })).sort((a: any, b: any) => a.year - b.year);
    return rows.length ? rows : null;
  } catch { return null; }
}

async function nihFunding(phrase: string) {
  const y = new Date().getFullYear();
  const years = [y - 5, y - 4, y - 3, y - 2, y - 1];
  try {
    const r = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criteria: { advanced_text_search: { operator: "and", search_field: "projecttitle,terms", search_text: phrase }, fiscal_years: years }, include_fields: ["FiscalYear", "AwardAmount"], limit: 500 }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const by: Record<number, { projects: number; usd: number }> = {};
    for (const p of d.results ?? []) {
      const fy = Number(p.fiscal_year); if (!fy) continue;
      by[fy] = by[fy] ?? { projects: 0, usd: 0 }; by[fy].projects++; by[fy].usd += Number(p.award_amount) || 0;
    }
    return { total: d.meta?.total ?? null, by_year: years.map((fy) => ({ year: fy, ...(by[fy] ?? { projects: 0, usd: 0 }) })) };
  } catch { return null; }
}

// ---------- Helpers ----------
async function roleOf(sb: SupabaseClient, projectId: string, userId: string) {
  const { data } = await sb.from("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  return data?.role as string | undefined;
}
function need(role: string | undefined, allowed: string[], what: string) {
  if (!role) throw new HttpError(403, "You're not a member of this project.");
  if (!allowed.includes(role)) throw new HttpError(403, `Only ${allowed.join(" or ")} members can ${what}.`);
}
async function log(sb: SupabaseClient, projectId: string, userId: string, text: string) {
  await sb.from("activity_log").insert({ project_id: projectId, actor_id: userId, text });
}
const ASSUMPTION_SHAPE = '{"id":"a1","category":"Customer|Problem|Price|Market size|Competition|Channel|Regulation","claim":"1 sentence","basis":"how it was estimated","confidence":"Low|Medium|High","check":"what evidence would confirm or reject it","search":"a precise search query","where":"patents|scholar|web"}';

// ---------- Actions ----------
async function assess(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead"], "run the idea check");
  const idea = { title: String(b.idea?.title ?? "").trim(), text: String(b.idea?.text ?? "").trim(), field: String(b.idea?.field ?? ""), goal: String(b.idea?.goal ?? "Academic paper") };
  if (!idea.title || !idea.text) throw new HttpError(400, "Add a title and a short description of the idea.");
  const papers = await semanticScholar(`${idea.title} ${idea.text.split(/\s+/).slice(0, 25).join(" ")}`);
  const list = papers.map((p: any, i: number) => `[${i}] ${p.title} (${p.year ?? "n.d."}): ${p.abstract || "no abstract"}`).join("\n");
  const out = await llmJSON(
`You are a research advisor assessing a new research idea.
Idea title: ${idea.title}
Field: ${idea.field || "not given"}
Goal: ${idea.goal}
Idea: ${idea.text}

Papers found by a search (discuss ONLY these; never cite papers from memory):
${list || "(none found)"}

Return JSON:
{"verdict":"Pursue|Refine|Rethink","viability_score":0-100,"summary":"2 sentences","novelty":{"score":0-100,"reason":"1 sentence"},"feasibility":{"score":0-100,"reason":"1 sentence"},"commercial_potential":{"score":0-100,"reason":"1 sentence"},"challenges":["3-5 items"],"gaps":["2-3 things the papers do not cover"],"paper_notes":[{"index":0,"relevance":"1 sentence"}],"assumptions":[${ASSUMPTION_SHAPE}]}
"assumptions" lists the 5-7 key assumptions behind commercial_potential, ids a1, a2, ... Label estimates as estimates. Be candid and specific.`);
  const assessment = {
    summary: String(out.summary ?? ""), novelty: out.novelty, feasibility: out.feasibility, commercial_potential: out.commercial_potential,
    challenges: out.challenges ?? [], gaps: out.gaps ?? [], assumptions: Array.isArray(out.assumptions) ? out.assumptions.slice(0, 8) : [],
  };
  const verdict = ["Pursue", "Refine", "Rethink"].includes(out.verdict) ? out.verdict : "Refine";
  const score = clamp(out.viability_score);
  // Re-running replaces the plan and everything that hangs off it.
  for (const t of ["tasks", "reviews", "directions", "papers", "evidence"]) {
    const { error } = await sb.from(t).delete().eq("project_id", b.projectId);
    if (error) throw new HttpError(500, error.message);
  }
  const { error } = await sb.from("projects").update({ title: idea.title, idea_text: idea.text, field: idea.field, goal: idea.goal, verdict, viability_score: score, assessment, milestones: [] }).eq("id", b.projectId);
  if (error) throw new HttpError(500, error.message);
  const notes = new Map<number, string>((out.paper_notes ?? []).map((n: any) => [Number(n.index), String(n.relevance ?? "")]));
  if (papers.length) await sb.from("papers").insert(papers.map((p: any, i: number) => ({ project_id: b.projectId, ...p, relevance_note: notes.get(i) ?? "" })));
  await log(sb, b.projectId, uid, `ran the idea check: ${verdict}, ${score}/100`);
  return { verdict, viability_score: score, suggestDirections: score < 50 || verdict === "Rethink" };
}

async function plan(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead"], "generate the plan");
  const { data: p } = await sb.from("projects").select("*").eq("id", b.projectId).single();
  if (!p?.assessment) throw new HttpError(400, "Run the idea check first.");
  const out = await llmJSON(
`You are a research project planner. Turn this idea into a validation plan.
Idea: ${p.title}. ${p.idea_text}
Goal: ${p.goal}
Known challenges: ${(p.assessment.challenges ?? []).join("; ")}
Return JSON: {"milestones":[{"title":"short","tasks":[{"title":"short action","method":"1 sentence","success_criterion":"measurable target with a number","est_days":number}]}]}
Give 3-5 milestones with 2-4 tasks each, in order. Every success criterion must be measurable.`);
  const ms = (out.milestones ?? []).filter((m: any) => m?.title);
  if (!ms.length) throw new HttpError(502, "The AI returned an empty plan. Try again.");
  await sb.from("tasks").delete().eq("project_id", b.projectId);
  await sb.from("reviews").delete().eq("project_id", b.projectId);
  let pos = 1;
  const rows = ms.flatMap((m: any) => (m.tasks ?? []).map((t: any) => ({
    project_id: b.projectId, milestone: String(m.title), title: String(t.title ?? "Task"), method: String(t.method ?? ""),
    success_criterion: String(t.success_criterion ?? ""), est_days: Math.max(1, Math.round(Number(t.est_days) || 1)), status: "To do", position: pos++, updated_by: uid,
  })));
  const { error } = await sb.from("tasks").insert(rows);
  if (error) throw new HttpError(500, error.message);
  await sb.from("projects").update({ milestones: ms.map((m: any) => String(m.title)) }).eq("id", b.projectId);
  await log(sb, b.projectId, uid, `generated a plan with ${rows.length} tasks`);
  return { tasks: rows.length };
}

async function review(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead", "Researcher"], "run a review");
  const [{ data: p }, { data: tasks }, { data: results }, { data: notes }] = await Promise.all([
    sb.from("projects").select("*").eq("id", b.projectId).single(),
    sb.from("tasks").select("*").eq("project_id", b.projectId).order("position"),
    sb.from("results").select("*").eq("project_id", b.projectId),
    sb.from("notes").select("*").eq("project_id", b.projectId),
  ]);
  if (!results?.length) throw new HttpError(400, "Log at least one result first.");
  const res = new Map((results ?? []).map((r: any) => [r.task_id, r]));
  const lines = (tasks ?? []).map((t: any) => {
    const r: any = res.get(t.id);
    return `- id=${t.id} [${t.status}] ${t.milestone}: ${t.title} | method: ${t.method || "-"} | criterion: ${t.success_criterion} | est_days: ${t.est_days}` +
      (t.due_date ? ` | due: ${t.due_date}` : "") + (t.status === "Blocked" && t.blocker ? ` | blocked by: ${t.blocker}` : "") +
      (r ? ` | result: ${r.outcome} | met: ${r.criterion_met}${r.notes ? " | notes: " + r.notes : ""}` : "");
  }).join("\n");
  const troubled = new Set([...(results ?? []).filter((r: any) => r.criterion_met !== "Yes").map((r: any) => r.task_id), ...(tasks ?? []).filter((t: any) => t.status === "Blocked").map((t: any) => t.id)]);
  const noteLines = (notes ?? []).filter((n: any) => n.kind === "Observation" || n.kind === "Decision").slice(0, 10)
    .map((n: any) => `- ${n.kind}: ${n.title}: ${String(n.body).slice(0, 300).replace(/\s+/g, " ")}`).join("\n");
  const protoLines = (notes ?? []).filter((n: any) => n.kind === "Protocol" && troubled.has(n.task_id)).slice(0, 4)
    .map((n: any) => `- Protocol for task ${n.task_id}: ${n.title}: ${String(n.body).slice(0, 600).replace(/\s+/g, " ")}`).join("\n");
  const out = await llmJSON(
`You are a research advisor reviewing progress on a project. Today is ${today()}.
Idea: ${p.title}. ${p.idea_text}
Milestones: ${(p.milestones ?? []).join(", ")}
Tasks and results:
${lines}
${noteLines ? "Lab notes:\n" + noteLines : ""}
${protoLines ? "Protocols for tasks that missed their criteria or are blocked (check whether a step could explain the result):\n" + protoLines : ""}
Diagnose why any results missed their criteria and recommend what to change next. Prefer editing an existing task when it only needs a tweak; add new tasks only for genuinely new work.
Return JSON: {"status":"On track|Adjust|Pivot","diagnosis":"2-3 sentences","recommendations":[{"change":"short","reason":"1 sentence tied to a result or note","edits":[{"task_id":"an id from the list","title":"optional","method":"optional","success_criterion":"optional","est_days":"optional number","status":"optional: To do|Running|Blocked"}],"new_tasks":[{"milestone":"an existing milestone","title":"","method":"","success_criterion":"measurable","est_days":1}]}]}
Give 2-3 recommendations; in each edit include only the fields you change.`);
  const ids = new Set((tasks ?? []).map((t: any) => t.id));
  const recs = (out.recommendations ?? []).slice(0, 4).map((r: any) => ({
    change: String(r.change ?? ""), reason: String(r.reason ?? ""),
    edits: (r.edits ?? []).filter((e: any) => ids.has(e.task_id)),
    new_tasks: (r.new_tasks ?? []).filter((t: any) => t?.title),
  }));
  const status = ["On track", "Adjust", "Pivot"].includes(out.status) ? out.status : "Adjust";
  const { data, error } = await sb.from("reviews").insert({ project_id: b.projectId, status, diagnosis: String(out.diagnosis ?? ""), recommendations: recs, run_by: uid }).select().single();
  if (error) throw new HttpError(500, error.message);
  await log(sb, b.projectId, uid, `ran an AI review: ${status}`);
  return data;
}

async function importWorks(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead", "Researcher"], "import publications");
  const { data: members } = await sb.from("project_members").select("user_id").eq("project_id", b.projectId);
  const { data: profiles } = await sb.from("profiles").select("id, orcid").in("id", (members ?? []).map((m: any) => m.user_id));
  const withOrcid = (profiles ?? []).filter((p: any) => p.orcid);
  const { data: existing } = await sb.from("publications").select("title, doi_or_url").eq("project_id", b.projectId);
  const seen = new Set((existing ?? []).flatMap((e: any) => [String(e.title).toLowerCase().trim(), String(e.doi_or_url).toLowerCase()]).filter(Boolean));
  let added = 0;
  for (const p of withOrcid) {
    let works = await openalexWorksByOrcid(p.orcid);
    if (!works.length) works = await orcidPublicWorks(p.orcid);
    const fresh = works.filter((w: any) => {
      const k1 = w.title.toLowerCase().trim(), k2 = String(w.doi_or_url).toLowerCase();
      if (seen.has(k1) || (k2 && seen.has(k2))) return false;
      seen.add(k1); if (k2) seen.add(k2); return true;
    });
    if (fresh.length) {
      const { error } = await sb.from("publications").insert(fresh.map((w: any) => ({ project_id: b.projectId, member_id: p.id, source: "orcid", ...w })));
      if (!error) added += fresh.length;
    }
  }
  if (added) await log(sb, b.projectId, uid, `imported ${added} publications from ORCID`);
  return { members_with_orcid: withOrcid.length, members: (members ?? []).length, added };
}

async function directions(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead", "Researcher"], "suggest related directions");
  await importWorks(sb, uid, b).catch(() => null);
  const [{ data: p }, { data: pubs }] = await Promise.all([
    sb.from("projects").select("*").eq("id", b.projectId).single(),
    sb.from("publications").select("title, year, abstract, topics").eq("project_id", b.projectId).order("year", { ascending: false }).limit(60),
  ]);
  if (!p?.assessment) throw new HttpError(400, "Run the idea check first.");
  const pubList = (pubs ?? []).map((x: any) => `- ${x.title}${x.year ? ` (${x.year})` : ""}${(x.topics ?? []).length ? ` [${x.topics.join(", ")}]` : ""}${x.abstract ? ": " + String(x.abstract).slice(0, 250) : ""}`).join("\n");
  // Step 1: candidates
  const c = await llmJSON(
`You are a research strategy advisor. A team's idea scored ${p.viability_score}/100 (${p.verdict}).
Idea: ${p.title}. ${p.idea_text}
Why it scored as it did: ${p.assessment.summary ?? ""} Challenges: ${(p.assessment.challenges ?? []).join("; ")}
The team's publications:
${pubList || "(none listed: infer expertise from the idea only and keep fit conservative)"}
Propose 6 related or adjacent research directions that build on the team's topics and methods and avoid what sank the idea.
Return JSON: {"expertise_summary":"2 sentences on what the publications show the team is good at","candidates":[{"title":"short","phrase":"3-6 word search phrase for the field"}]}`);
  const cands = (c.candidates ?? []).filter((x: any) => x?.title && x?.phrase).slice(0, 6);
  if (!cands.length) throw new HttpError(502, "The AI returned no candidate directions. Try again.");
  // Step 2: signals
  const [trends, funding, market] = await Promise.all([
    Promise.all(cands.map((x: any) => openalexTrend(x.phrase))),
    Promise.all(cands.map((x: any) => nihFunding(x.phrase))),
    llmJSON(
`Use web search to find current commercial signals for each of these research directions: recent products, startups, investment or deals, patent activity, and any market-size figure. Only report facts you found, each with its source URL.
${cands.map((x: any, i: number) => `${i}. ${x.title} (${x.phrase})`).join("\n")}
Return JSON: {"market":[{"index":0,"signals":[{"claim":"1 sentence","number":"the figure, if any","source_url":"https://..."}]}]}`, true).catch(() => ({ market: [] })),
  ]);
  const marketBy = new Map((market.market ?? []).map((m: any) => [Number(m.index), (m.signals ?? []).filter((s: any) => /^https?:\/\//.test(String(s.source_url ?? "")))]));
  const evidence = cands.map((x: any, i: number) => ({
    index: i, title: x.title, phrase: x.phrase,
    papers_per_year: trends[i], nih_funding: funding[i], market: marketBy.get(i) ?? [],
  }));
  // Step 3: tally
  const out = await llmJSON(
`Rank these candidate research directions for a team whose idea scored low. Use ONLY the evidence given; never invent numbers.
Team's publications:
${pubList || "(none)"}
Candidates with evidence (papers_per_year from OpenAlex, nih_funding from NIH RePORTER, market from web search):
${JSON.stringify(evidence).slice(0, 24000)}
Score each on fit (with the team's publications), momentum (research and funding growth), commercial_pull (market signals), room (active but not crowded) and feasibility. Return the top 3-5, best first.
Return JSON: {"suggestions":[{"index":0,"title":"","pitch":"2 sentences","builds_on":["exact titles from the team's publications"],"scores":{"fit":0,"momentum":0,"commercial_pull":0,"room":0,"feasibility":0},"overall":0,"reasons":["3-4 reasons citing the evidence"],"signals":[{"claim":"","number":"","source_url":""}],"first_experiment":"cheapest test","risk":"1 sentence"}]}
Signals must be copied from the evidence (market items keep their source_url; for papers or funding use https://openalex.org or https://reporter.nih.gov as the source).`);
  const titles = new Set((pubs ?? []).map((x: any) => String(x.title).toLowerCase().trim()));
  const suggestions = (out.suggestions ?? []).slice(0, 5).map((s: any) => ({
    title: String(s.title ?? ""), pitch: String(s.pitch ?? ""),
    builds_on: (s.builds_on ?? []).filter((t: any) => titles.has(String(t).toLowerCase().trim())),
    scores: Object.fromEntries(["fit", "momentum", "commercial_pull", "room", "feasibility"].map((k) => [k, clamp(s.scores?.[k])])),
    overall: clamp(s.overall), reasons: (s.reasons ?? []).slice(0, 5).map(String),
    signals: (s.signals ?? []).filter((g: any) => /^https?:\/\//.test(String(g.source_url ?? ""))).slice(0, 6),
    trend: evidence[Number(s.index)]?.papers_per_year ?? null, funding: evidence[Number(s.index)]?.nih_funding?.by_year ?? null,
    first_experiment: String(s.first_experiment ?? ""), risk: String(s.risk ?? ""),
  })).sort((a: any, b2: any) => b2.overall - a.overall);
  const { data, error } = await sb.from("directions").insert({ project_id: b.projectId, expertise_summary: String(c.expertise_summary ?? ""), suggestions, based_on_count: (pubs ?? []).length, run_by: uid }).select().single();
  if (error) throw new HttpError(500, error.message);
  await log(sb, b.projectId, uid, `suggested ${suggestions.length} related directions`);
  return data;
}

async function rescore(sb: SupabaseClient, uid: string, b: any) {
  need(await roleOf(sb, b.projectId, uid), ["Lead"], "re-score the commercial case");
  const [{ data: p }, { data: ev }, { data: ec }] = await Promise.all([
    sb.from("projects").select("*").eq("id", b.projectId).single(),
    sb.from("evidence").select("*").eq("project_id", b.projectId),
    sb.from("econ").select("*").eq("project_id", b.projectId).maybeSingle(),
  ]);
  const a = p?.assessment; if (!a) throw new HttpError(400, "Run the idea check first.");
  const evBy = new Map((ev ?? []).map((e: any) => [e.assumption_id, e]));
  const lines = (a.assumptions ?? []).map((x: any) => { const e: any = evBy.get(x.id); return `- ${x.id} [${x.category}] ${x.claim} | basis: ${x.basis} | evidence: ${e ? e.status + (e.note ? " - " + e.note : "") + (e.link ? " (" + e.link + ")" : "") : "Unchecked"}`; }).join("\n");
  const out = await llmJSON(
`Re-score the commercial potential of this research idea using the evidence the team gathered.
Idea: ${p.title}. ${p.idea_text}
Previous commercial potential: ${a.commercial_potential?.score ?? "?"}/100; previous viability ${p.viability_score}/100.
Assumptions and evidence:
${lines}
${ec && Number(ec.price) ? `Unit economics entered by the team: price ${ec.price} ${ec.currency} per unit, cost ${ec.cost} per unit, ${ec.units} units per year.` : ""}
Raise the score only where evidence confirms an assumption; lower it where evidence rejects one. Keep assumption ids; you may add up to 2 new ones.
Return JSON: {"commercial_potential":{"score":0-100,"reason":"1-2 sentences mentioning the evidence"},"viability_score":0-100,"assumptions":[${ASSUMPTION_SHAPE}]}`);
  const assessment = { ...a, commercial_potential: { score: clamp(out.commercial_potential?.score), reason: String(out.commercial_potential?.reason ?? "") }, assumptions: Array.isArray(out.assumptions) && out.assumptions.length ? out.assumptions : a.assumptions };
  const { error } = await sb.from("projects").update({ assessment, viability_score: clamp(out.viability_score ?? p.viability_score) }).eq("id", b.projectId);
  if (error) throw new HttpError(500, error.message);
  await log(sb, b.projectId, uid, `re-scored commercial potential: ${assessment.commercial_potential.score}/100`);
  return { commercial_potential: assessment.commercial_potential };
}

const ACTIONS: Record<string, (sb: SupabaseClient, uid: string, b: any) => Promise<unknown>> = {
  assess, plan, review, directions, "import-works": importWorks, rescore,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) throw new HttpError(401, "Sign in again.");
    const b = await req.json();
    const fn = ACTIONS[String(b.action)];
    if (!fn) throw new HttpError(400, "Unknown action.");
    if (!b.projectId) throw new HttpError(400, "Missing project.");
    return json(await fn(sb, user.id, b));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : "Something went wrong." }, status);
  }
});

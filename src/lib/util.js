export const STATUSES = ["To do", "Running", "Blocked", "Done"];
export const KINDS = ["Protocol", "Observation", "Decision", "Literature"];
export const ROLES = ["Lead", "Researcher", "Observer"];
export const GOALS = ["Academic paper", "Product", "Grant proposal"];
export const DIR_THRESHOLD = 50;
export const ROLE_INFO = {
  Lead: "Everything: run the idea check, generate the plan, approve AI changes, invite people and set roles, delete the project.",
  Researcher: "Add, edit, move and assign tasks; log results; write notes; record evidence; run AI reviews and related directions. AI changes wait for a Lead.",
  Observer: "Read everything and comment on tasks. Can't change the plan, results or notes.",
};
export const TAB_NAMES = { idea: "Idea check", plan: "Research plan", results: "Log results", dash: "Dashboard", next: "Next steps", notes: "Notes", team: "Team" };

export const today = () => new Date().toISOString().slice(0, 10);
export const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d) => (d ? `${Number(String(d).slice(8, 10))} ${MONTHS[Number(String(d).slice(5, 7)) - 1]}` : "");
export function ago(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + " d ago";
  return fmtDate(new Date(t).toISOString().slice(0, 10));
}
export const pillClass = (s) => ({
  Pursue: "good", "On track": "good", Yes: "good", Met: "good", Confirmed: "good",
  Refine: "warn", Adjust: "warn", Partly: "warn", "At risk": "warn",
  Rethink: "bad", Pivot: "bad", No: "bad", Blocked: "bad", "Off track": "bad", Rejected: "bad",
  "Not tested": "none", "Not started": "none", "Not checked": "none",
}[s] || "warn");

export function goalStatus(tasks, results) {
  if (!tasks.length) return "Not started";
  const ids = new Set(tasks.map((t) => t.id));
  const res = results.filter((r) => ids.has(r.task_id));
  if (res.some((r) => r.criterion_met === "No")) return "Off track";
  if (res.some((r) => r.criterion_met === "Partly") || tasks.some((t) => t.status === "Blocked") || tasks.some((t) => t.status !== "Done" && t.due_date && t.due_date < today())) return "At risk";
  if (!res.length && tasks.every((t) => t.status === "To do")) return "Not started";
  return "On track";
}

export function allMilestones(project, tasks) {
  const out = [...((project && project.milestones) || [])];
  tasks.forEach((t) => { if (t.milestone && !out.includes(t.milestone)) out.push(t.milestone); });
  return out;
}

export const assumptionsOf = (a) => ((a && Array.isArray(a.assumptions)) ? a.assumptions.filter((x) => x && x.id && x.claim) : []);
export function evidenceCounts(a, evidence) {
  const list = assumptionsOf(a);
  const st = (id) => (evidence.find((e) => e.assumption_id === id) || {}).status;
  return { n: list.length, conf: list.filter((x) => st(x.id) === "Confirmed").length, rej: list.filter((x) => st(x.id) === "Rejected").length };
}
export function searchUrl(x) {
  const q = encodeURIComponent(x.search || x.claim || "");
  return x.where === "patents" ? "https://patents.google.com/?q=" + q : x.where === "scholar" ? "https://scholar.google.com/scholar?q=" + q : "https://www.google.com/search?q=" + q;
}
export const whereLabel = (w) => (w === "patents" ? "Google Patents" : w === "scholar" ? "Google Scholar" : "the web");
export const isUrl = (s) => /^https?:\/\//i.test(String(s || ""));
export const normOrcid = (s) => {
  const m = String(s || "").toUpperCase().match(/(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])/);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : null;
};

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, waitForJob } from "./supabase.js";
import { getJob, runJob } from "./jobs.js";
import { useToast } from "../components/Toast.jsx";

const Ctx = createContext(null);
export const useP = () => useContext(Ctx);

// Every table the project screens read, and how to load it.
const LOADERS = {
  project: (pid) => supabase.from("projects").select("*").eq("id", pid).maybeSingle(),
  members: (pid) => supabase.from("project_members").select("*").eq("project_id", pid).order("created_at"),
  tasks: (pid) => supabase.from("tasks").select("*").eq("project_id", pid).order("position"),
  results: (pid) => supabase.from("results").select("*").eq("project_id", pid).order("logged_at"),
  notes: (pid) => supabase.from("notes").select("*").eq("project_id", pid).order("updated_at", { ascending: false }),
  comments: (pid) => supabase.from("comments").select("*").eq("project_id", pid).order("created_at"),
  reviews: (pid) => supabase.from("reviews").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(1),
  evidence: (pid) => supabase.from("evidence").select("*").eq("project_id", pid),
  publications: (pid) => supabase.from("publications").select("*").eq("project_id", pid).order("year", { ascending: false }),
  directions: (pid) => supabase.from("directions").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(1),
  activity: (pid) => supabase.from("activity_log").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(40),
  papers: (pid) => supabase.from("papers").select("*").eq("project_id", pid).order("created_at"),
  econ: (pid) => supabase.from("econ").select("*").eq("project_id", pid).maybeSingle(),
  invites: (pid) => supabase.from("invites").select("*").eq("project_id", pid).is("accepted_at", null).order("created_at", { ascending: false }),
};
const TABLE_KEYS = {
  projects: "project", project_members: "members", tasks: "tasks", results: "results", notes: "notes", comments: "comments",
  reviews: "reviews", evidence: "evidence", publications: "publications", directions: "directions", activity_log: "activity", papers: "papers", econ: "econ",
};
// Which tab's status each AI action shows in, and what to refresh when it finishes.
const JOB_KEY = { assess: "idea", plan: "plan", review: "review", directions: "dirs", "import-works": "orcid", rescore: "rescore" };
const JOB_RELOAD = {
  assess: ["project", "papers", "tasks", "results", "reviews", "directions", "evidence", "activity"],
  plan: ["tasks", "results", "reviews", "project", "activity"], review: ["reviews", "activity"],
  directions: ["directions", "publications", "activity"], "import-works": ["publications", "activity"], rescore: ["project", "activity"],
};
const EMPTY = { project: null, members: [], tasks: [], results: [], notes: [], comments: [], reviews: [], evidence: [], publications: [], directions: [], activity: [], papers: [], econ: null, invites: [] };

export function ProjectProvider({ pid, session, tab, children }) {
  const me = session.user.id;
  const toast = useToast();
  const [d, setD] = useState(EMPTY);
  const [profiles, setProfiles] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [online, setOnline] = useState([]);
  const timers = useRef({});
  const channelRef = useRef(null);

  const load = useCallback(async (key) => {
    const { data, error } = await LOADERS[key](pid);
    if (error) { if (key !== "invites") console.warn(key, error.message); return; }
    setD((x) => ({ ...x, [key]: data ?? EMPTY[key] }));
    if (key === "project" && !data) setMissing(true);
  }, [pid]);

  // After you change something: reload it here, and tell everyone else on the project to reload it too.
  const broadcast = useCallback((keys) => {
    channelRef.current?.send?.({ type: "broadcast", event: "changed", payload: { keys } });
  }, []);
  const reload = useCallback((...keys) => {
    const list = keys.flat();
    broadcast(list);
    return Promise.all(list.map(load));
  }, [load, broadcast]);
  const soon = useCallback((key) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => load(key), 120);
  }, [load]);

  // First load
  useEffect(() => {
    let live = true;
    setD(EMPTY); setLoaded(false); setMissing(false);
    Promise.all(Object.keys(LOADERS).map(load)).then(() => { if (live) setLoaded(true); });
    supabase.from("project_members").update({ last_seen: new Date().toISOString() }).eq("project_id", pid).eq("user_id", me).then(() => {});
    return () => { live = false; };
  }, [pid, me, load]);

  // Pick up AI jobs that are already running: after a page reload, or started by a teammate.
  const track = useCallback((row) => {
    const key = JOB_KEY[row.action];
    if (!key || row.status !== "running" || Date.now() - Date.parse(row.updated_at || row.created_at) > 175000) return;
    const id = pid + ":" + key;
    if (getJob(id)?.busy) return;
    runJob(id, (pr) => waitForJob(row.id, pr)).then(() => Promise.all(JOB_RELOAD[row.action].map(load)));
  }, [pid, load]);
  const checkJobs = useCallback(() => {
    supabase.from("ai_jobs").select("id, action, status, created_at, updated_at").eq("project_id", pid).eq("status", "running")
      .then(({ data }) => (data || []).forEach(track));
  }, [pid, track]);
  useEffect(() => { checkJobs(); }, [checkJobs]);

  // Safety net: while the project is on screen, re-check every 20 s, and right away when you come back to the tab.
  useEffect(() => {
    const LIVE = ["project", "members", "tasks", "results", "notes", "comments", "reviews", "evidence", "publications", "directions", "activity", "econ"];
    const refresh = () => { if (document.visibilityState === "visible") { LIVE.forEach(soon); checkJobs(); } };
    const t = setInterval(refresh, 20000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [soon, checkJobs]);

  // Live updates + who is here
  useEffect(() => {
    const ch = supabase.channel("project:" + pid, { config: { presence: { key: me } } });
    for (const [table, key] of Object.entries(TABLE_KEYS)) {
      const filter = table === "projects" ? `id=eq.${pid}` : `project_id=eq.${pid}`;
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => soon(key));
      ch.on("postgres_changes", { event: "DELETE", schema: "public", table }, () => soon(key));
    }
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_jobs", filter: `project_id=eq.${pid}` }, (e) => { if (e.new && e.new.created_by !== me) track(e.new); });
    // Teammates' changes, sent browser to browser (works even if database change events are off)
    ch.on("broadcast", { event: "changed" }, ({ payload }) => {
      (payload?.keys || []).forEach((k) => { if (LOADERS[k]) soon(k); });
      if ((payload?.keys || []).includes("ai_jobs")) checkJobs();
    });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState();
      setOnline(Object.entries(st).map(([id, metas]) => ({ id, tab: metas[metas.length - 1]?.tab })));
    });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") ch.track({ tab: tab || "" }); });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, [pid, me, soon, track, checkJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { channelRef.current?.track?.({ tab: tab || "" }); }, [tab]);

  // Names for everyone who appears anywhere in the project
  useEffect(() => {
    const ids = new Set([me, ...d.members.map((m) => m.user_id), ...d.tasks.map((t) => t.assignee_id), ...d.comments.map((c) => c.author_id),
      ...d.activity.map((a) => a.actor_id), ...d.notes.map((n) => n.updated_by), ...d.results.map((r) => r.logged_by), ...online.map((o) => o.id)]);
    const want = [...ids].filter((x) => x && !(x in profiles));
    if (!want.length) return;
    setProfiles((p) => ({ ...p, ...Object.fromEntries(want.map((x) => [x, null])) }));
    supabase.from("profiles").select("id, display_name, orcid").in("id", want).then(({ data }) => {
      if (data) setProfiles((p) => ({ ...p, ...Object.fromEntries(data.map((x) => [x.id, x])) }));
    });
  }, [d.members, d.tasks, d.comments, d.activity, d.notes, d.results, online, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = (d.members.find((m) => m.user_id === me) || {}).role || null;
  const value = useMemo(() => {
    const name = (id) => (!id ? "Someone" : (profiles[id] && profiles[id].display_name) || (id === me ? "You" : "Teammate"));
    const act = (text, target_id = null) => supabase.from("activity_log").insert({ project_id: pid, actor_id: me, text, target_id }).then(() => { soon("activity"); broadcast(["activity"]); });
    /** Run a write; on failure show a toast. Reloads the given tables right away (realtime catches everyone else up). */
    const run = async (promise, keys = [], okMsg) => {
      const { error, data } = await promise;
      if (error) {
        const m = error.message || "";
        toast(/row-level security|permission|violates/i.test(m) ? "You don't have permission to change this. Ask a Lead to change your role." : m || "Couldn't save that change. Try again.");
        return null;
      }
      if (keys.length) await reload(keys);
      if (okMsg) toast(okMsg);
      return data ?? true;
    };
    return {
      pid, me, d, profiles, name, loaded, missing, online, role, tab,
      isLead: role === "Lead", canEdit: role === "Lead" || role === "Researcher", isMember: !!role,
      reload, run, act, toast, broadcast,
      review: d.reviews[0] || null, directions: d.directions[0] || null,
    };
  }, [pid, me, d, profiles, loaded, missing, online, role, tab, reload, soon, toast, broadcast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago, clamp, goalStatus, pct, pillClass } from "../lib/util.js";
import { useToast } from "../components/Toast.jsx";
import TopBar from "../components/TopBar.jsx";

export default function Home({ session }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: projects, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
    if (error) { toast(error.message); setRows([]); return; }
    const ids = projects.map((p) => p.id);
    if (!ids.length) { setRows([]); return; }
    const [{ data: tasks }, { data: results }, { data: members }] = await Promise.all([
      supabase.from("tasks").select("id, project_id, status, due_date, updated_at").in("project_id", ids),
      supabase.from("results").select("task_id, project_id, criterion_met, logged_at").in("project_id", ids),
      supabase.from("project_members").select("project_id, user_id, role").in("project_id", ids),
    ]);
    setRows(projects.map((p) => {
      const T = (tasks || []).filter((t) => t.project_id === p.id);
      const R = (results || []).filter((r) => r.project_id === p.id);
      const M = (members || []).filter((m) => m.project_id === p.id);
      const last = Math.max(Date.parse(p.updated_at), ...T.map((t) => Date.parse(t.updated_at)), ...R.map((r) => Date.parse(r.logged_at)));
      return { p, T, R, M, last, myRole: (M.find((m) => m.user_id === session.user.id) || {}).role };
    }).sort((a, b) => b.last - a.last));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.from("projects").insert({ title: "", created_by: session.user.id }).select().single();
    setBusy(false);
    if (error) { toast(error.message); return; }
    await supabase.from("activity_log").insert({ project_id: data.id, actor_id: session.user.id, text: "started the project" });
    go(`p/${data.id}/idea`);
  };
  const myExample = (rows || []).find(({ p }) => p.is_example && p.created_by === session.user.id);
  const example = async () => {
    if (myExample) { go(`p/${myExample.p.id}/dash`); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_example_project");
    setBusy(false);
    if (error) { toast(error.message); return; }
    go(`p/${data}/dash`);
  };

  return (
    <div className="wrap">
      <TopBar session={session} title="Research projects" />
      <main className="panel">
        <div className="panel-head">
          <div>
            <span className="label">All projects</span>
            <h2>Your research projects</h2>
            <p className="muted">Each project has its own idea check, plan, results, dashboard and notes. You see the projects you lead or were invited to.</p>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={example} disabled={busy || rows === null}>Open the example project</button>
            <button className="btn primary" type="button" onClick={create} disabled={busy}>+ New project</button>
          </div>
        </div>
        {rows === null ? <p className="muted">Loading your projects…</p> : !rows.length ? (
          <div className="empty">
            <h3>Start with an idea</h3>
            <p className="muted">Create a project and describe your research idea. ResearchOS checks it against real papers, builds a plan with measurable goals, and tells you what to change as results come in.</p>
            <div className="row">
              <button className="btn primary" type="button" onClick={create} disabled={busy}>+ New project</button>
              <button className="btn" type="button" onClick={example} disabled={busy}>Or open a worked example</button>
            </div>
          </div>
        ) : (
          <div className="proj-grid">
            {rows.map(({ p, T, R, M, last, myRole }) => {
              const done = T.filter((t) => t.status === "Done").length;
              const met = R.filter((x) => x.criterion_met === "Yes").length;
              const gs = goalStatus(T, R);
              return (
                <button key={p.id} className="proj-card" type="button" onClick={() => go(`p/${p.id}/${T.length ? "dash" : "idea"}`)}>
                  <span className="label">{[p.field, p.goal].filter(Boolean).join(" · ") || "New project"}{p.is_example ? <span className="example-tag">Example</span> : null}</span>
                  <strong className="pt">{p.title || "Untitled project"}</strong>
                  <span className="row" style={{ gap: 6 }}>
                    {p.verdict ? <span className={"pill " + pillClass(p.verdict)}>{p.verdict} · {clamp(p.viability_score)}/100</span> : <span className="pill none">Idea not checked yet</span>}
                    {T.length ? <span className={"pill " + pillClass(gs)}>{gs}</span> : null}
                  </span>
                  {T.length ? <span className="pbar" role="img" aria-label={`${pct(done, T.length)}% of tasks done`}><i style={{ width: pct(done, T.length) + "%" }} /></span> : null}
                  <span className="ms-sub">{T.length ? `${done} of ${T.length} tasks done · goals met ${met} of ${R.length} tested` : "No plan yet"}</span>
                  <span className="ms-sub">{M.length} member{M.length === 1 ? "" : "s"} · you're a {myRole || "member"} · updated {ago(last)}</span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

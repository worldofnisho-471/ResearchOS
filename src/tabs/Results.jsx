import { useEffect, useState } from "react";
import { useP } from "../lib/project.jsx";
import { supabase } from "../lib/supabase.js";
import { go, useRoute } from "../lib/router.js";
import { pillClass } from "../lib/util.js";

export default function Results() {
  const P = useP();
  const { d, pid, me, canEdit, run, act, name } = P;
  const sub = useRoute()[3];
  const pick = () => (sub && d.tasks.some((t) => t.id === sub) ? sub : (d.tasks.find((t) => t.status !== "Done") || d.tasks[0] || {}).id);
  const [taskId, setTaskId] = useState(pick);
  useEffect(() => { if (sub && d.tasks.some((t) => t.id === sub)) setTaskId(sub); }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!taskId || !d.tasks.some((t) => t.id === taskId)) setTaskId(pick()); }, [d.tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const task = d.tasks.find((t) => t.id === taskId);
  const prev = (task && d.results.find((r) => r.task_id === task.id)) || null;
  const blank = { what_done: "", outcome: "", criterion_met: "Yes", notes: "" };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState("");
  useEffect(() => { setF(prev ? { what_done: prev.what_done, outcome: prev.outcome, criterion_met: prev.criterion_met, notes: prev.notes } : blank); setMsg(""); }, [taskId, prev?.id, prev?.logged_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const head = <div className="panel-head"><div><span className="label">Stage 3</span><h2>Log results</h2><p className="muted">Record what you did and whether the task met its success criterion.</p></div></div>;
  if (!d.tasks.length) return <>{head}<div className="empty"><p>There are no tasks yet. Build the plan first.</p><button className="btn" type="button" onClick={() => go(`p/${pid}/plan`)}>Go to plan</button></div></>;

  const save = async (e) => {
    e.preventDefault();
    if (!f.outcome.trim()) { setMsg("Add the outcome you observed."); return; }
    const ok = await run(supabase.from("results").upsert({
      task_id: task.id, project_id: pid, what_done: f.what_done.trim(), outcome: f.outcome.trim(), criterion_met: f.criterion_met, notes: f.notes.trim(),
      logged_by: me, logged_at: new Date().toISOString(),
    }, { onConflict: "task_id" }), []);
    if (!ok) return;
    if (task.status !== "Done") await supabase.from("tasks").update({ status: "Done", updated_by: me }).eq("id", task.id);
    await P.reload("results", "tasks");
    act(`logged a result for "${task.title}": criterion ${f.criterion_met === "Yes" ? "met" : f.criterion_met === "Partly" ? "partly met" : "missed"}`, task.id);
    P.toast("Result saved and the task moved to Done.");
  };

  const entries = d.results.slice().sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at));
  const hasMiss = d.results.some((r) => r.criterion_met !== "Yes");
  return (
    <>
      {head}
      <form className="grid" onSubmit={save}>
        <div className="field wide"><label className="label" htmlFor="r-task">Task</label>
          <select id="r-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {d.tasks.map((t) => <option key={t.id} value={t.id}>{t.milestone} · {t.title}{d.results.some((r) => r.task_id === t.id) ? " ✓" : ""}</option>)}
          </select></div>
        <p className="crit field wide">Success criterion: {task?.success_criterion}</p>
        <fieldset disabled={!canEdit} style={{ display: "contents" }}>
          <div className="field wide"><label className="label" htmlFor="r-what">What you did</label><textarea id="r-what" value={f.what_done} onChange={set("what_done")} /></div>
          <div className="field wide"><label className="label" htmlFor="r-outcome">Outcome observed</label><textarea id="r-outcome" value={f.outcome} onChange={set("outcome")} /></div>
          <div className="field"><label className="label" htmlFor="r-met">Criterion met?</label>
            <select id="r-met" value={f.criterion_met} onChange={set("criterion_met")}>{["Yes", "Partly", "No"].map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="r-notes">Notes</label><input id="r-notes" value={f.notes} onChange={set("notes")} /></div>
        </fieldset>
        <div className="row field wide">
          {canEdit ? <button className="btn primary" type="submit">{prev ? "Update result" : "Save result"}</button> : <p className="muted">Observers can read results but not log them.</p>}
          <p className="status err" role="status">{msg}</p>
        </div>
      </form>
      {d.results.length ? <div className="row"><button className={"btn" + (hasMiss ? " primary" : "")} type="button" onClick={() => go(`p/${pid}/next`)}>{hasMiss ? "A result missed its target — get next steps" : "Review progress"}</button></div> : null}
      <section className="log">
        <h3>Lab log</h3>
        {entries.length ? entries.map((r, k) => {
          const t = d.tasks.find((x) => x.id === r.task_id);
          return (
            <article className="entry" key={r.id}>
              <div className="entry-top">
                <span className="label">Entry {String(entries.length - k).padStart(2, "0")} · {String(r.logged_at).slice(0, 10)} · {name(r.logged_by)}</span>
                <span className={"pill " + pillClass(r.criterion_met)}>Criterion met: {r.criterion_met}</span>
              </div>
              <strong>{t ? t.title : "Removed task"}</strong>
              {r.what_done ? <p className="muted">{r.what_done}</p> : null}
              <p>{r.outcome}</p>
              {r.notes ? <p className="muted" style={{ fontSize: ".88rem" }}>Note: {r.notes}</p> : null}
            </article>
          );
        }) : <p className="muted">No results logged yet.</p>}
      </section>
    </>
  );
}

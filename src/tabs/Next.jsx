import { useP } from "../lib/project.jsx";
import { ai, supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago, allMilestones, pillClass, STATUSES } from "../lib/util.js";
import { useBusy } from "../components/ui.jsx";

const FIELDS = [["title", "Title"], ["method", "Method"], ["success_criterion", "Success"], ["est_days", "Days"], ["status", "Status"]];

export default function Next() {
  const P = useP();
  const { d, pid, me, canEdit, isLead, review: rv, reload, name, act, toast } = P;
  const { busy, run, Status } = useBusy();

  const go2 = async () => { if (await run("review", () => ai("review", pid))) await reload("reviews", "activity"); };
  const head = (
    <div className="panel-head">
      <div>
        <span className="label">Stage 5</span><h2>What should change next?</h2>
        <p className="muted">The AI reads the plan, every logged result, your observation and decision notes, and the protocols behind any missed or blocked task. Then it suggests tweaks, new tasks or a pivot. A Lead approves each change before it reaches the board.</p>
      </div>
      {d.results.length && canEdit ? <div className="row"><button className="btn primary" type="button" disabled={busy === "review"} onClick={go2}>{rv ? "Review again" : "Review progress"}</button></div> : null}
    </div>
  );
  if (!d.results.length) return <>{head}<div className="empty"><p>Log at least one result first. Reviews are based on what actually happened.</p><button className="btn" type="button" onClick={() => go(`p/${pid}/results`)}>Go to results</button></div></>;
  if (!rv) return <>{head}<Status k="review" text="Reading results and notes… this can take up to a minute." /><div className="empty"><p>{d.results.length} result{d.results.length > 1 ? "s" : ""} logged. {canEdit ? "Run a review to get recommendations." : "A Researcher or Lead can run a review."}</p></div></>;

  const applied = rv.applied || [];
  const apply = async (rec, i, eds, nts) => {
    for (const e of eds) {
      const f = { changed_by_review: true, updated_by: me };
      for (const [k] of FIELDS) if (e[k] != null && e[k] !== "") f[k] = k === "est_days" ? Math.max(1, Math.round(Number(e[k]) || 1)) : String(e[k]);
      if (f.status && !STATUSES.includes(f.status)) delete f.status;
      const { error } = await supabase.from("tasks").update(f).eq("id", e.task_id);
      if (error) { toast(error.message); return; }
    }
    const ms = allMilestones(d.project, d.tasks);
    let pos = Math.max(0, ...d.tasks.map((t) => t.position)) + 1;
    if (nts.length) {
      const { error } = await supabase.from("tasks").insert(nts.map((t) => ({
        project_id: pid, milestone: ms.includes(t.milestone) ? t.milestone : ms[0] || "Plan", title: String(t.title), method: String(t.method || ""),
        success_criterion: String(t.success_criterion || ""), est_days: Math.max(1, Math.round(Number(t.est_days) || 1)), status: "To do", added_by_review: true, position: pos++, updated_by: me,
      })));
      if (error) { toast(error.message); return; }
    }
    const ok = await P.run(supabase.from("reviews").update({ applied: [...applied, i] }).eq("id", rv.id), ["reviews", "tasks"]);
    if (ok) { act(`applied the AI recommendation "${rec.change}"`); toast("Applied. The plan is updated for everyone."); }
  };

  return (
    <>
      {head}
      <Status k="review" text="Reading results and notes… this can take up to a minute." />
      <div className="diag">
        <div className="row"><span className={"pill " + pillClass(rv.status)}>Status: {rv.status}</span><span className="ms-sub">Run by {name(rv.run_by)} · {ago(rv.created_at)}</span></div>
        <p>{rv.diagnosis}</p>
      </div>
      <div className="recs">
        {(rv.recommendations || []).map((rec, i) => {
          const done = applied.includes(i);
          const eds = (rec.edits || []).filter((e) => e && d.tasks.some((t) => t.id === e.task_id));
          const nts = rec.new_tasks || [];
          const what = [eds.length && `change ${eds.length} task${eds.length > 1 ? "s" : ""}`, nts.length && `add ${nts.length} task${nts.length > 1 ? "s" : ""}`].filter(Boolean).join(", ");
          return (
            <article className="rec" key={i}>
              <span className="label">Recommendation {i + 1}</span>
              <h3>{rec.change}</h3>
              <p className="muted" style={{ fontSize: ".9rem" }}>{rec.reason}</p>
              {eds.length || nts.length ? (
                <div className="newtasks">
                  {eds.map((e, k) => {
                    const t = d.tasks.find((x) => x.id === e.task_id);
                    const rows = FIELDS.filter(([f]) => e[f] != null && e[f] !== "" && (done || String(e[f]) !== String(t[f])));
                    return (
                      <div className="nt chg" key={"e" + k}>
                        <span className="tag">Change task</span><strong>{t.title}</strong>
                        {rows.map(([f, label]) => <div key={f}>{label}: {done ? null : <><del>{String(t[f] ?? "")}</del> → </>}<ins>{String(e[f])}</ins></div>)}
                      </div>
                    );
                  })}
                  {nts.map((t, k) => <div className="nt" key={"n" + k}><span className="tag">New task</span><strong>{t.title}</strong><div className="muted">Success: {t.success_criterion}</div></div>)}
                </div>
              ) : <p className="muted" style={{ fontSize: ".85rem" }}>Advice only; nothing to change on the board.</p>}
              {what ? <div>{done ? <button className="btn small" type="button" disabled>Applied to plan</button>
                : isLead ? <button className="btn small primary" type="button" onClick={(e) => { e.currentTarget.disabled = true; apply(rec, i, eds, nts); }}>Approve: {what}</button>
                : <p className="muted" style={{ fontSize: ".85rem" }}>Waiting for a Lead to approve.</p>}</div> : null}
            </article>
          );
        })}
      </div>
      {applied.length ? <div className="row"><button className="btn" type="button" onClick={() => go(`p/${pid}/plan`)}>See updated plan</button></div> : null}
    </>
  );
}

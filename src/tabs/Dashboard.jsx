import { useState } from "react";
import { useP } from "../lib/project.jsx";
import { go } from "../lib/router.js";
import { allMilestones, evidenceCounts, fmtDate, goalStatus, pct, pillClass, today } from "../lib/util.js";
import { Avatar } from "../components/ui.jsx";
import TaskSheet from "../components/TaskSheet.jsx";

export default function Dashboard() {
  const P = useP();
  const { d, pid, me, name, review } = P;
  const [open, setOpen] = useState(null);
  const T = d.tasks, R = d.results;
  const head = (
    <div className="panel-head"><div>
      <span className="label">Stage 4 · Dashboard</span>
      <h2>Are the research goals being met?</h2>
      <p className="muted">Live progress from the plan and every logged result. Each task's success criterion is a goal; a goal is met when its result says so.</p>
    </div></div>
  );
  if (!T.length) return <>{head}<div className="empty"><p>No plan yet, so there's nothing to track. Run the idea check and build the plan first.</p>
    <button className="btn" type="button" onClick={() => go(`p/${pid}/${d.project.assessment ? "plan" : "idea"}`)}>{d.project.assessment ? "Go to research plan" : "Go to idea check"}</button></div></>;

  const resOf = (id) => R.find((r) => r.task_id === id);
  const done = T.filter((t) => t.status === "Done").length;
  const met = R.filter((r) => r.criterion_met === "Yes").length, partly = R.filter((r) => r.criterion_met === "Partly").length, no = R.filter((r) => r.criterion_met === "No").length;
  const blocked = T.filter((t) => t.status === "Blocked");
  const overdue = T.filter((t) => t.status !== "Done" && t.due_date && t.due_date < today());
  const overall = goalStatus(T, R);
  const ec = evidenceCounts(d.project.assessment, d.evidence);

  const Kpi = ({ cls = "", label, big, small, note }) => (
    <div className={"kpi " + cls}><span className="label">{label}</span><div className="big">{big}{small ? <small>{small}</small> : null}</div><span className="note">{note}</span></div>
  );

  const statusData = [["Done", "var(--good)"], ["Running", "var(--accent)"], ["Blocked", "var(--bad)"], ["To do", "var(--muted)"]].map(([s, c]) => ({ s, c, n: T.filter((t) => t.status === s).length }));
  const Cc = 2 * Math.PI * 52, gap = statusData.filter((x) => x.n).length > 1 ? 3 : 0;
  let off = 0;
  const arcs = statusData.filter((x) => x.n).map((x) => {
    const len = (x.n / T.length) * Cc;
    const el = <circle key={x.s} cx="70" cy="70" r="52" fill="none" stroke={x.c} strokeWidth="18" strokeDasharray={`${Math.max(len - gap, 0.5)} ${Cc}`} strokeDashoffset={-off}><title>{`${x.s}: ${x.n} task${x.n === 1 ? "" : "s"} (${pct(x.n, T.length)}%)`}</title></circle>;
    off += len; return el;
  });
  const notTested = T.filter((t) => !resOf(t.id)).length;
  const goalData = [["Met", met, "var(--good)"], ["Partly met", partly, "var(--warn)"], ["Missed", no, "var(--bad)"], ["Not tested yet", notTested, "var(--muted)"]];
  const gmax = Math.max(1, ...goalData.map((g) => g[1]));
  const ticks = [gmax, Math.round(gmax / 2), 0].filter((v, k, a) => a.indexOf(v) === k);

  const order = { No: 0, Partly: 1, Yes: 2 };
  const rows = T.map((t) => ({ t, r: resOf(t.id) })).sort((a, b) => (a.r ? order[a.r.criterion_met] ?? 3 : 4) - (b.r ? order[b.r.criterion_met] ?? 3 : 4));
  const attn = [
    ...R.filter((r) => r.criterion_met !== "Yes").map((r) => ({ id: r.task_id, why: `Result ${r.criterion_met === "No" ? "missed" : "partly met"} its goal`, cls: r.criterion_met === "No" ? "bad" : "warn" })),
    ...blocked.map((t) => ({ id: t.id, why: "Blocked: " + (t.blocker || "no reason given"), cls: "bad" })),
    ...overdue.map((t) => ({ id: t.id, why: "Overdue since " + fmtDate(t.due_date), cls: "warn" })),
  ].filter((x) => T.some((t) => t.id === x.id));
  const loadIds = [...new Set(T.filter((t) => t.assignee_id && t.status !== "Done").map((t) => t.assignee_id))];
  const unassigned = T.filter((t) => !t.assignee_id && t.status !== "Done").length;

  return (
    <>
      {head}
      <div className="kpis">
        <Kpi label="Tasks done" big={`${pct(done, T.length)}%`} small={`${done} of ${T.length}`} note={`${T.filter((t) => t.status === "Running").length} running, ${T.filter((t) => t.status === "To do").length} to do`} />
        <Kpi cls={R.length ? (met === R.length ? "good" : no ? "bad" : "warn") : ""} label="Goals met" big={R.length ? `${met}` : "–"} small={R.length ? `of ${R.length} tested` : "none tested yet"} note={R.length ? `${partly} partly, ${no} missed` : "Log results to start scoring"} />
        <Kpi cls={blocked.length ? "bad" : ""} label="Blocked" big={`${blocked.length}`} small={blocked.length === 1 ? "task" : "tasks"} note={blocked.length ? "Waiting on something outside the team" : "Nothing blocked"} />
        <Kpi cls={overdue.length ? "warn" : ""} label="Overdue" big={`${overdue.length}`} small={overdue.length === 1 ? "task" : "tasks"} note={overdue.length ? "Past their due date and not done" : "Nothing overdue"} />
      </div>
      <div className="diag">
        <div className="row">
          <span className={"pill " + pillClass(overall)}>Overall: {overall}</span>
          {review ? <span className={"pill " + pillClass(review.status)}>Last AI review: {review.status}</span> : null}
          {ec.n ? <span className={"pill " + (ec.rej ? "bad" : ec.conf === ec.n ? "good" : "warn")}>Commercial case: {ec.conf} of {ec.n} assumptions confirmed{ec.rej ? `, ${ec.rej} rejected` : ""}</span> : null}
        </div>
        <p>{overall === "Off track" ? "At least one result missed its success criterion. Run a review in Next steps to decide what to change."
          : overall === "At risk" ? "Some goals are only partly met, blocked or overdue. Check the items under Needs attention."
          : overall === "Not started" ? "No work has started yet. Move a task to Running when you begin."
          : "Every result so far meets its success criterion."}</p>
      </div>
      <div className="charts">
        <div className="chart-card">
          <h3>Tasks by status</h3>
          <div className="donut-wrap">
            <div className="donut" role="img" aria-label={"Tasks by status: " + statusData.map((x) => `${x.s} ${x.n}`).join(", ")}>
              <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="52" fill="none" stroke="var(--paper)" strokeWidth="18" /><g transform="rotate(-90 70 70)">{arcs}</g></svg>
              <div className="donut-c"><strong>{pct(done, T.length)}%</strong><span>done</span></div>
            </div>
            <ul className="chart-legend">
              {statusData.map((x) => <li key={x.s}><i style={{ background: x.c }} /><span>{x.s}</span><b>{x.n}</b><span className="ms-sub">{pct(x.n, T.length)}%</span></li>)}
            </ul>
          </div>
        </div>
        <div className="chart-card">
          <h3>Goal results</h3>
          <div className="vbars" role="img" aria-label={"Goal results: " + goalData.map((g) => `${g[0]} ${g[1]}`).join(", ")}>
            <div className="vgrid" aria-hidden="true">{ticks.map((v) => <span key={v} style={{ bottom: (v / gmax) * 100 + "%" }}>{v}</span>)}</div>
            {goalData.map(([l, n, c]) => (
              <div className="vbar" key={l} title={`${l}: ${n} of ${T.length} goals`}>
                <div className="vcol">
                  <i style={n ? { height: (n / gmax) * 100 + "%", background: c } : { height: 2, opacity: 0.5, background: c }} />
                  <b style={{ bottom: `calc(${(n / gmax) * 100}% + 4px)` }}>{n}</b>
                </div>
                <span className="vl">{l}</span>
              </div>
            ))}
          </div>
          <p className="ms-sub">{T.length} goals in total, one per task.</p>
        </div>
      </div>
      <div className="dash-grid">
        <section>
          <h3>Progress by milestone</h3>
          <div className="legend">{[["s-done", "Done"], ["s-running", "Running"], ["s-blocked", "Blocked"], ["s-todo", "To do"]].map(([c, l]) => <span key={l}><i className={c} />{l}</span>)}</div>
          <div>
            {allMilestones(d.project, T).map((m) => {
              const mt = T.filter((t) => t.milestone === m);
              if (!mt.length) return null;
              const c = (s) => mt.filter((t) => t.status === s).length;
              const mr = mt.map((t) => resOf(t.id)).filter(Boolean);
              const gs = goalStatus(mt, R);
              const seg = (cls, n, label) => (n ? <i className={cls} style={{ width: (n / mt.length) * 100 + "%" }} title={`${label}: ${n}`} /> : null);
              return (
                <div className="ms-row" key={m}>
                  <div className="ms-top"><strong>{m}</strong><span className={"pill " + pillClass(gs)}>{gs}</span></div>
                  <div className="stack" role="img" aria-label={`${m}: ${c("Done")} done, ${c("Running")} running, ${c("Blocked")} blocked, ${c("To do")} to do`}>
                    {seg("s-done", c("Done"), "Done")}{seg("s-running", c("Running"), "Running")}{seg("s-blocked", c("Blocked"), "Blocked")}{seg("s-todo", c("To do"), "To do")}
                  </div>
                  <span className="ms-sub">{c("Done")} of {mt.length} tasks done · goals met {mr.filter((r) => r.criterion_met === "Yes").length} of {mr.length} tested</span>
                </div>
              );
            })}
          </div>
        </section>
        <section>
          <h3>Needs attention</h3>
          <div className="attn">
            {attn.length ? attn.map((x, i) => (
              <button key={i} type="button" onClick={() => setOpen(T.find((t) => t.id === x.id))}>
                <strong>{T.find((t) => t.id === x.id).title}</strong><span className="why" style={{ color: `var(--${x.cls})` }}>{x.why}</span>
              </button>
            )) : <p className="muted">Nothing needs attention right now.</p>}
          </div>
          <h3>Open tasks by person</h3>
          <div>
            {loadIds.map((id) => {
              const o = T.filter((t) => t.assignee_id === id && t.status !== "Done");
              return <div className="load-row" key={id}><Avatar id={id} name={name(id)} /><span>{name(id)}{id === me ? " (you)" : ""}</span><span className="ms-sub">{o.length} open{o.some((t) => t.status === "Blocked") ? " · 1+ blocked" : ""}</span></div>;
            })}
            <div className="load-row"><span className="av" aria-hidden="true" /><span className="muted">Unassigned</span><span className="ms-sub">{unassigned} open</span></div>
          </div>
        </section>
      </div>
      <section style={{ display: "grid", gap: 10 }}>
        <h3>Goal scorecard</h3>
        <div className="table-wrap"><table className="score">
          <thead><tr><th>Task</th><th>Goal (success criterion)</th><th>Result</th></tr></thead>
          <tbody>{rows.map(({ t, r }) => {
            const label = r ? (r.criterion_met === "Yes" ? "Met" : r.criterion_met === "Partly" ? "Partly met" : "Missed") : t.status === "Blocked" ? "Blocked" : "Not tested";
            return (
              <tr key={t.id}>
                <td><strong>{t.title}</strong><div className="ms-sub">{t.milestone}</div></td>
                <td className="crit-cell">{t.success_criterion}</td>
                <td><span className={"pill " + pillClass(r ? r.criterion_met : label)}>{label}</span>{r ? <div className="ms-sub" style={{ marginTop: 4 }}>{r.outcome}</div> : null}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
      {open ? <TaskSheet task={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

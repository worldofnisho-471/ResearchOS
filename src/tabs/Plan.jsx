import { useEffect, useRef, useState } from "react";
import { useP } from "../lib/project.jsx";
import { ai } from "../lib/supabase.js";
import { go, useRoute } from "../lib/router.js";
import { allMilestones, fmtDate, STATUSES, today } from "../lib/util.js";
import { Avatar, useBusy } from "../components/ui.jsx";
import TaskSheet, { setStatus } from "../components/TaskSheet.jsx";

/** Pointer-based drag that works with a mouse, a pen, or a long press on touch screens. */
function useDrag(onDrop, enabled) {
  const st = useRef(null);
  const [overCol, setOverCol] = useState(null);
  const [dragId, setDragId] = useState(null);
  const suppress = useRef(false);

  useEffect(() => {
    const block = (e) => { if (st.current?.active) e.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, []);

  const colAt = (x, y) => document.elementFromPoint(x, y)?.closest?.(".col[data-status]")?.dataset.status || null;
  const begin = (s, e) => {
    s.active = true; setDragId(s.id);
    const r = s.el.getBoundingClientRect();
    const g = s.el.cloneNode(true);
    g.classList.add("ghost"); g.style.width = r.width + "px"; g.style.left = r.left + "px"; g.style.top = r.top + "px";
    document.body.append(g);
    s.ghost = g; s.dx = e.clientX - r.left; s.dy = e.clientY - r.top;
    navigator.vibrate?.(10);
  };
  const end = () => {
    const s = st.current; st.current = null;
    if (!s) return false;
    clearTimeout(s.timer);
    s.ghost?.remove();
    setDragId(null); setOverCol(null);
    return s.active;
  };

  const handlers = (t) => !enabled ? {} : ({
    onPointerDown: (e) => {
      if (e.button !== 0 || e.target.closest("select, button, a, input")) return;
      const s = { id: t.id, t, x: e.clientX, y: e.clientY, el: e.currentTarget, active: false, touch: e.pointerType === "touch" };
      st.current = s;
      if (s.touch) s.timer = setTimeout(() => { if (st.current === s) begin(s, e); }, 280);
    },
    onPointerMove: (e) => {
      const s = st.current;
      if (!s || s.id !== t.id) return;
      const far = Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 6;
      if (!s.active) {
        if (s.touch) { if (far) { clearTimeout(s.timer); st.current = null; } return; }
        if (!far) return;
        begin(s, e);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      s.ghost.style.left = e.clientX - s.dx + "px"; s.ghost.style.top = e.clientY - s.dy + "px";
      setOverCol(colAt(e.clientX, e.clientY));
    },
    onPointerUp: (e) => {
      const s = st.current;
      if (!s) return;
      const col = s.active ? colAt(e.clientX, e.clientY) : null;
      const was = end();
      if (was) {
        e.preventDefault();
        suppress.current = true; setTimeout(() => { suppress.current = false; }, 60);
        if (col) onDrop(s.t, col);
      }
    },
    onPointerCancel: end,
    onClickCapture: (e) => { if (suppress.current) { e.stopPropagation(); e.preventDefault(); } },
  });
  return { handlers, overCol, dragId };
}

export default function Plan() {
  const P = useP();
  const { d, pid, me, canEdit, isLead, name, reload } = P;
  const [open, setOpen] = useState(null);
  // A link like #/p/<project>/plan/<task> (from a mention) opens that task straight away.
  const sub = useRoute()[3];
  useEffect(() => {
    if (!sub) return;
    const t = d.tasks.find((x) => x.id === sub);
    if (t) { setOpen({ task: t, focus: "c-text" }); go(`p/${pid}/plan`); }
  }, [sub, d.tasks, pid]);
  const [q, setQ] = useState(""); const [owner, setOwner] = useState("any"); const [msF, setMsF] = useState("all"); const [upd, setUpd] = useState("any");
  const [armed, setArmed] = useState(false);
  const { isBusy, run, Status, setErr } = useBusy();
  const openBlocked = (t) => setOpen({ task: t, focus: "e-blocker" });
  const { handlers, overCol, dragId } = useDrag((t, s) => setStatus(P, t, s, openBlocked), canEdit);
  const ms = allMilestones(d.project, d.tasks);

  const generate = async () => {
    if (d.tasks.length && !armed) { setArmed(true); setErr({ key: "plan", msg: "This replaces every task and result for everyone. Click again to confirm." }); return; }
    setArmed(false);
    if (await run("plan", (pr) => ai("plan", pid, {}, pr))) await reload("tasks", "results", "reviews", "project", "activity");
  };

  const head = (
    <div className="panel-head">
      <div>
        <span className="label">Stage 2</span><h2>Research plan</h2>
        <p className="muted">Milestones and tasks, each with a measurable success criterion. Drag a card to another column (long-press on a phone, or use its status menu), and click it to edit, assign or comment.</p>
      </div>
      {d.project.assessment ? (
        <div className="row">
          {canEdit ? <button className="btn" type="button" onClick={() => setOpen({ task: "new" })}>+ Add task</button> : null}
          {isLead ? <button className="btn primary" type="button" disabled={isBusy("plan")} onClick={generate}>{d.tasks.length ? "Regenerate plan" : "Generate plan"}</button> : null}
        </div>
      ) : null}
    </div>
  );
  const sheet = open ? <TaskSheet task={open.task} focus={open.focus} onClose={() => setOpen(null)} /> : null;

  if (!d.project.assessment) return <>{head}<div className="empty"><p>Run the idea check first. The plan is built from its challenges.</p><button className="btn" type="button" onClick={() => go(`p/${pid}/idea`)}>Go to idea check</button></div></>;
  if (!d.tasks.length) return <>{head}<Status k="plan" text="Building the plan… this can take up to a minute." /><div className="empty"><p>{isLead ? "No plan yet. Generate one from the idea check, or add tasks by hand." : canEdit ? "No plan yet. A Lead can generate one, or you can add tasks by hand." : "No plan yet. A Lead can generate one."}</p></div>{sheet}</>;

  const ql = q.trim().toLowerCase(), DAY = 864e5, now = Date.now();
  const shown = d.tasks.filter((t) =>
    (!ql || [t.title, t.method, t.success_criterion, t.blocker, t.milestone].some((x) => String(x || "").toLowerCase().includes(ql))) &&
    (owner === "any" || (owner === "mine" ? t.assignee_id === me : owner === "none" ? !t.assignee_id : t.assignee_id === owner)) &&
    (msF === "all" || t.milestone === msF) &&
    (upd === "any" || (upd === "7d" ? now - Date.parse(t.updated_at) <= 7 * DAY : now - Date.parse(t.updated_at) > 14 * DAY)));
  const ownerIds = [...new Set([...d.members.map((m) => m.user_id), ...d.tasks.map((t) => t.assignee_id)].filter((x) => x && x !== me))];
  const active = ql || owner !== "any" || msF !== "all" || upd !== "any";
  const clear = () => { setQ(""); setOwner("any"); setMsF("all"); setUpd("any"); };

  return (
    <>
      {head}
      <Status k="plan" text="Building the plan… this can take up to a minute." />
      <div className="filters" role="search" aria-label="Filter tasks">
        <input type="search" className="fsearch" placeholder="Search tasks, methods, criteria…" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="any">Any owner</option><option value="mine">My tasks</option><option value="none">Unassigned</option>
          {ownerIds.map((id) => <option key={id} value={id}>{name(id)}</option>)}
        </select>
        <select aria-label="Filter by milestone" value={msF} onChange={(e) => setMsF(e.target.value)}>
          <option value="all">All milestones</option>{ms.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Filter by last update" value={upd} onChange={(e) => setUpd(e.target.value)}>
          <option value="any">Updated any time</option><option value="7d">Updated in the last 7 days</option><option value="stale">Not touched in 14+ days</option>
        </select>
        {active ? <span className="fcount">Showing {shown.length} of {d.tasks.length} tasks · <button className="linkbtn" type="button" onClick={clear}>Clear filters</button></span> : null}
      </div>
      <div className="board">
        {STATUSES.map((s) => {
          const list = shown.filter((t) => t.status === s);
          return (
            <div key={s} className={"col" + (s === "Blocked" ? " col-blocked" : "") + (overCol === s && dragId ? " drop" : "")} data-status={s}>
              <div className="col-head"><span className="label">{s}</span><span className="count">{list.length}</span></div>
              {list.length ? list.map((t) => {
                const nC = d.comments.filter((c) => c.task_id === t.id).length;
                const late = t.due_date && t.status !== "Done" && t.due_date < today();
                const hasResult = d.results.some((r) => r.task_id === t.id);
                return (
                  <div key={t.id} className={"card" + (t.added_by_review ? " new" : "") + (t.status === "Blocked" ? " blocked" : "") + (dragId === t.id ? " dragging" : "")}
                    role="button" tabIndex={0} data-task={t.id} {...handlers(t)}
                    onClick={() => setOpen({ task: t })}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setOpen({ task: t }); } }}>
                    <span className="ms">{t.milestone}{t.added_by_review ? " · added by review" : t.changed_by_review ? " · changed by review" : ""}</span>
                    <span className="t">{t.title}</span>
                    {t.status === "Blocked" ? <span className="blocker">Blocked: {t.blocker || "reason not given yet"}</span> : null}
                    <span className="crit">Success: {t.success_criterion}</span>
                    {t.assignee_id || t.due_date ? (
                      <span className="who-due">
                        {t.assignee_id ? <span className="assignee"><Avatar id={t.assignee_id} name={name(t.assignee_id)} size="sm" />{t.assignee_id === me ? "You" : name(t.assignee_id)}</span> : <span>Unassigned</span>}
                        {t.due_date ? <span className={"due" + (late ? " late" : "")}>{late ? "Overdue · " : "Due "}{fmtDate(t.due_date)}</span> : null}
                      </span>
                    ) : null}
                    <span className="meta">
                      <span>~{t.est_days} d{hasResult ? " · result" : ""}{nC ? ` · ${nC} comment${nC > 1 ? "s" : ""}` : ""}</span>
                      <select className="move" aria-label={"Status of " + t.title} value={t.status} disabled={!canEdit}
                        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => setStatus(P, t, e.target.value, openBlocked)}>
                        {STATUSES.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </span>
                  </div>
                );
              }) : <p className="muted drop-hint">{active ? "No matching tasks." : canEdit ? "Drop a task here." : "No tasks."}</p>}
            </div>
          );
        })}
      </div>
      {sheet}
    </>
  );
}

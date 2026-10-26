import { useEffect, useRef, useState } from "react";
import { useP } from "../lib/project.jsx";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago, allMilestones, STATUSES } from "../lib/util.js";
import { Avatar, ConfirmButton } from "./ui.jsx";

export async function setStatus(P, t, s, onBlocked) {
  if (!t || !P.canEdit || t.status === s) return;
  const ok = await P.run(supabase.from("tasks").update({ status: s, updated_by: P.me }).eq("id", t.id), ["tasks"]);
  if (ok) {
    P.act(`moved "${t.title}" to ${s}`, t.id);
    if (s === "Blocked" && !t.blocker && onBlocked) onBlocked({ ...t, status: s });
  }
}

/** Opens a task to edit it, comment on it, or jump to its result and notes. task === "new" adds one. */
export default function TaskSheet({ task, focus, onClose }) {
  const P = useP();
  const { d, pid, me, canEdit, isLead, run, act, name } = P;
  const isNew = task === "new";
  const t = isNew ? null : d.tasks.find((x) => x.id === task.id) || task;
  const ms = allMilestones(d.project, d.tasks);
  const [v, setV] = useState(() => t ? { ...t, due_date: t.due_date || "", assignee_id: t.assignee_id || "" }
    : { title: "", milestone: ms[0] || "", method: "", success_criterion: "", est_days: 3, status: "To do", blocker: "", assignee_id: "", due_date: "" });
  const [msg, setMsg] = useState("");
  const [newMs, setNewMs] = useState(() => !ms.length);
  const msOptions = v.milestone && !ms.includes(v.milestone) && !newMs ? [...ms, v.milestone] : ms;
  const [comment, setComment] = useState("");
  const box = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    const f = box.current?.querySelector("#" + (focus || "e-title"));
    if (f && !f.disabled) f.focus(); else box.current?.querySelector("button")?.focus();
    return () => { document.removeEventListener("keydown", esc); prev?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    const data = {
      title: v.title.trim(), milestone: (v.milestone || "").trim() || "General", method: (v.method || "").trim(), success_criterion: (v.success_criterion || "").trim(),
      est_days: Math.max(1, Math.round(Number(v.est_days) || 1)), status: v.status, blocker: (v.blocker || "").trim(),
      assignee_id: v.assignee_id || null, due_date: v.due_date || null, updated_by: me,
    };
    if (newMs && !(v.milestone || "").trim()) { setMsg("Name the new milestone, or pick an existing one."); return; }
    if (!data.title || !data.success_criterion) { setMsg("A task needs a title and a success criterion."); return; }
    if (isNew) {
      const pos = Math.max(0, ...d.tasks.map((x) => x.position)) + 1;
      const ok = await run(supabase.from("tasks").insert({ ...data, project_id: pid, position: pos }), ["tasks"]);
      if (!ok) return;
      act(`added the task "${data.title}"`);
    } else {
      const ok = await run(supabase.from("tasks").update(data).eq("id", t.id), ["tasks"]);
      if (!ok) return;
      if (data.status !== t.status) act(`moved "${data.title}" to ${data.status}`, t.id);
      else if (data.assignee_id !== (t.assignee_id || null)) act(!data.assignee_id ? `unassigned "${data.title}"` : data.assignee_id === me ? `took on "${data.title}"` : `assigned "${data.title}" to ${name(data.assignee_id)}`, t.id);
      else act(`edited "${data.title}"`, t.id);
    }
    onClose();
  };
  const post = async () => {
    const body = comment.trim();
    if (!body) return;
    if (await run(supabase.from("comments").insert({ project_id: pid, task_id: t.id, author_id: me, body }), ["comments"])) {
      setComment(""); act(`commented on "${t.title}"`, t.id);
    }
  };
  const del = async () => {
    if (await run(supabase.from("tasks").delete().eq("id", t.id), ["tasks", "results", "comments", "notes"])) {
      act(`deleted the task "${t.title}"`); onClose();
    }
  };

  const memberIds = [...new Set([me, ...d.members.map((m) => m.user_id), v.assignee_id].filter(Boolean))];
  const comments = t ? d.comments.filter((c) => c.task_id === t.id) : [];
  const linked = t ? d.notes.filter((n) => n.task_id === t.id) : [];
  const result = t ? d.results.find((r) => r.task_id === t.id) : null;

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={isNew ? "Add task" : "Task details"} ref={box}>
        <div className="panel-head"><div>
          <span className="label">{isNew ? "New task" : canEdit ? "Edit task" : "Task"}</span>
          <h2>{isNew ? "Add a task to the plan" : t.title}</h2>
          {t && (t.added_by_review || t.changed_by_review) ? <span className="tag">{t.added_by_review ? "Added by AI review" : "Changed by AI review"}</span> : null}
        </div></div>
        <form className="grid" onSubmit={save}>
          <fieldset disabled={!canEdit} style={{ display: "contents" }}>
            <div className="field wide"><label className="label" htmlFor="e-title">Task</label><input id="e-title" value={v.title} onChange={set("title")} /></div>
            <div className="field"><label className="label" htmlFor="e-ms">Milestone</label>
              <select id="e-ms" value={newMs ? "__new" : v.milestone}
                onChange={(e) => { if (e.target.value === "__new") { setNewMs(true); setV((x) => ({ ...x, milestone: "" })); } else { setNewMs(false); setV((x) => ({ ...x, milestone: e.target.value })); } }}>
                {msOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value="__new">+ New milestone…</option>
              </select>
              {newMs ? <input id="e-ms-new" aria-label="New milestone name" value={v.milestone} onChange={set("milestone")} placeholder="Name the new milestone" autoFocus={ms.length > 0} /> : null}
            </div>
            <div className="field"><label className="label" htmlFor="e-status">Status</label>
              <select id="e-status" value={v.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="e-assignee">Owner</label>
              <select id="e-assignee" value={v.assignee_id || ""} onChange={set("assignee_id")}>
                <option value="">Unassigned</option>
                {memberIds.map((id) => <option key={id} value={id}>{name(id)}{id === me ? " (you)" : ""}</option>)}
              </select></div>
            <div className="field"><label className="label" htmlFor="e-due">Due date</label><input id="e-due" type="date" value={v.due_date || ""} onChange={set("due_date")} /></div>
            <div className="field wide"><label className="label" htmlFor="e-blocker">What's blocking it? (if blocked)</label>
              <input id="e-blocker" value={v.blocker || ""} onChange={set("blocker")} placeholder="e.g. Waiting for reagent delivery" /></div>
            <div className="field wide"><label className="label" htmlFor="e-method">Method</label><textarea id="e-method" style={{ minHeight: 70 }} value={v.method || ""} onChange={set("method")} /></div>
            <div className="field wide"><label className="label" htmlFor="e-crit">Success criterion (measurable)</label><input id="e-crit" value={v.success_criterion} onChange={set("success_criterion")} /></div>
            <div className="field"><label className="label" htmlFor="e-days">Estimated days</label><input id="e-days" type="number" min="1" value={v.est_days} onChange={set("est_days")} /></div>
          </fieldset>
          <div className="row field wide">
            {canEdit ? <button className="btn primary" type="submit">{isNew ? "Add task" : "Save changes"}</button> : null}
            <button className="btn" type="button" onClick={onClose}>{canEdit ? "Cancel" : "Close"}</button>
            <p className="status err" role="status">{msg}</p>
          </div>
        </form>

        {t ? (
          <>
            {result ? <p className="ev-rec"><span className="label">Result · criterion met: {result.criterion_met}</span><span>{result.outcome}</span></p> : null}
            <section className="linked">
              <h3>Comments</h3>
              <div className="comments">
                {comments.length ? comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar id={c.author_id} name={name(c.author_id)} />
                    <div>
                      <div className="line1"><strong>{name(c.author_id)}</strong><span className="when">{ago(c.created_at)}</span>
                        {c.author_id === me || isLead ? <button className="linkbtn" type="button" onClick={() => run(supabase.from("comments").delete().eq("id", c.id), ["comments"])}>Delete</button> : null}
                      </div>
                      <p>{c.body}</p>
                    </div>
                  </div>
                )) : <p className="muted" style={{ fontSize: ".88rem" }}>No comments yet. Ask a question or share an update.</p>}
              </div>
              {P.isMember ? (
                <div className="composer">
                  <textarea id="c-text" aria-label="Write a comment" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="row"><button className="btn small primary" type="button" onClick={post}>Post comment</button></div>
                </div>
              ) : null}
            </section>
            <section className="linked">
              <h3>Notes on this task</h3>
              {linked.length ? linked.map((n) => (
                <button key={n.id} className="note-item" type="button" onClick={() => { onClose(); go(`p/${pid}/notes/${n.id}`); }}>
                  <span className="top"><strong>{n.title}</strong><span className="kind">{n.kind}</span></span>
                </button>
              )) : <p className="muted" style={{ fontSize: ".88rem" }}>No notes yet.</p>}
            </section>
            {canEdit ? (
              <div className="row">
                <button className="btn small" type="button" onClick={() => { onClose(); go(`p/${pid}/results/${t.id}`); }}>{result ? "Update result" : "Log result"}</button>
                <button className="btn small" type="button" onClick={() => { onClose(); go(`p/${pid}/notes/new-${t.id}`); }}>Add a note</button>
                <ConfirmButton confirm="Click again to delete this task, its result and comments" onConfirm={del}>Delete task</ConfirmButton>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

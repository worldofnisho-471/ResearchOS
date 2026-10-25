import { useEffect, useState } from "react";
import { useP } from "../lib/project.jsx";
import { supabase } from "../lib/supabase.js";
import { useRoute } from "../lib/router.js";
import { fmtDate, KINDS } from "../lib/util.js";
import { Chevron, ConfirmButton, hl, snippet } from "../components/ui.jsx";

function NoteForm({ n, onDone }) {
  const P = useP();
  const { d, pid, me, run, act } = P;
  const [f, setF] = useState({ kind: n.kind, title: n.title, body: n.body, task_id: n.task_id || "" });
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) { setMsg("Give the note a title."); return; }
    const row = { kind: f.kind, title: f.title.trim(), body: f.body, task_id: f.task_id || null, updated_by: me };
    const res = n.id
      ? await run(supabase.from("notes").update(row).eq("id", n.id).select().single(), ["notes"])
      : await run(supabase.from("notes").insert({ ...row, project_id: pid, author_id: me }).select().single(), ["notes"]);
    if (!res) return;
    act(n.id ? `edited the note "${row.title}"` : `added the note "${row.title}"`, res.id);
    onDone(res.id, n.id ? "Changes saved." : "Note created.");
  };
  return (
    <div className="note-open">
      <span className="label">{n.id ? "Editing · last updated " + fmtDate(n.updated_at) : "New note"}</span>
      <form className="grid note-editor" onSubmit={save}>
        <div className="field wide"><label className="label" htmlFor="n-title">Title</label><input id="n-title" value={f.title} onChange={set("title")} placeholder="e.g. Strip preparation protocol" autoFocus /></div>
        <div className="field"><label className="label" htmlFor="n-kind">Type</label><select id="n-kind" value={f.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="n-task">Linked task</label>
          <select id="n-task" value={f.task_id} onChange={set("task_id")}><option value="">None (whole project)</option>{d.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
        <div className="field wide"><label className="label" htmlFor="n-body">Note</label><textarea id="n-body" value={f.body} onChange={set("body")} placeholder="Steps, readings, what you decided and why…" /></div>
        <div className="row field wide">
          <button className="btn primary" type="submit">{n.id ? "Save changes" : "Create note"}</button>
          <button className="btn" type="button" onClick={() => onDone(n.id || null)}>Cancel</button>
          <p className="status err" role="status">{msg}</p>
        </div>
      </form>
    </div>
  );
}

export default function Notes() {
  const P = useP();
  const { d, canEdit, run, act, name } = P;
  const sub = useRoute()[3] || "";
  const [sel, setSel] = useState(null);       // note id, or "new"
  const [newTask, setNewTask] = useState(null);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState("");
  const [kind, setKind] = useState("All");
  const [q, setQ] = useState("");
  const [taskF, setTaskF] = useState("all");

  useEffect(() => {
    if (sub.startsWith("new")) { setSel("new"); setNewTask(sub.slice(4) || null); setEditing(true); }
    else if (sub) { setSel(sub); setEditing(false); }
  }, [sub]);
  useEffect(() => { if (sel && sel !== "new") document.getElementById("note-" + sel)?.scrollIntoView?.({ block: "nearest" }); }, [sel]);

  const taskTitle = (id) => (d.tasks.find((t) => t.id === id) || {}).title;
  const nq = q.trim().toLowerCase();
  const list = d.notes.filter((n) => (kind === "All" || n.kind === kind)
    && (taskF === "all" || (taskF === "none" ? !n.task_id : n.task_id === taskF))
    && (!nq || (n.title + "\n" + n.body).toLowerCase().includes(nq)));
  const count = (k) => (k === "All" ? d.notes.length : d.notes.filter((n) => n.kind === k).length);
  const active = nq || kind !== "All" || taskF !== "all";
  const done = (id, msg) => { setEditing(false); setNewTask(null); setSel(id); setFlash(msg || ""); };
  const del = async (n) => { if (await run(supabase.from("notes").delete().eq("id", n.id), ["notes"])) { act(`deleted the note "${n.title}"`); setSel(null); } };

  return (
    <>
      <div className="panel-head">
        <div>
          <span className="label">Project notes</span><h2>Lab notebook</h2>
          <p className="muted">Protocols, observations, decisions and reading notes, each optionally linked to a task. The AI review reads observations and decisions, plus protocols linked to tasks that missed their criteria or are blocked.</p>
        </div>
        {canEdit ? <div className="row"><button className="btn primary" type="button" onClick={() => { setSel("new"); setNewTask(null); setEditing(true); setFlash(""); }}>+ New note</button></div> : null}
      </div>
      <div className="filters" role="search" aria-label="Filter notes">
        <input type="search" className="fsearch" placeholder="Search note titles and text…" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by linked task" value={taskF} onChange={(e) => setTaskF(e.target.value)}>
          <option value="all">Any linked task</option><option value="none">Whole project (no task)</option>
          {d.tasks.filter((t) => d.notes.some((n) => n.task_id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        {active ? <span className="fcount">Showing {list.length} of {d.notes.length} notes · <button className="linkbtn" type="button" onClick={() => { setQ(""); setKind("All"); setTaskF("all"); }}>Clear filters</button></span> : null}
      </div>
      <div className="chips" role="group" aria-label="Filter notes by type">
        {["All", ...KINDS].map((k) => <button key={k} className="chip" type="button" aria-pressed={kind === k ? "true" : "false"} onClick={() => setKind(k)}>{k} · {count(k)}</button>)}
      </div>
      <div className="note-list">
        {sel === "new" && canEdit ? (
          <article className="note-card open" id="note-new">
            <NoteForm n={{ id: null, kind: newTask ? "Observation" : "Protocol", title: "", body: "", task_id: newTask }} onDone={done} />
          </article>
        ) : null}
        {list.length ? list.map((n) => {
          const open = sel === n.id;
          if (open && editing) return <article key={n.id} className="note-card open" id={"note-" + n.id}><NoteForm n={n} onDone={done} /></article>;
          const meta = `${fmtDate(String(n.updated_at).slice(0, 10))} · ${name(n.updated_by)}${n.task_id && taskTitle(n.task_id) ? " · " + taskTitle(n.task_id) : " · whole project"}`;
          return (
            <article key={n.id} className={"note-card" + (open ? " open" : "")} id={"note-" + n.id}>
              <button className="note-head" type="button" aria-expanded={open ? "true" : "false"} onClick={() => { setSel(open ? null : n.id); setEditing(false); setFlash(""); }}>
                <span className="top"><strong>{hl(n.title || "Untitled note", nq)}</strong><span className="right"><span className="kind">{n.kind}</span><Chevron /></span></span>
                <span className="label">{meta}</span>
                {open ? null : <p className="preview">{hl(snippet(n.body || "", nq), nq)}</p>}
              </button>
              {open ? (
                <div className="note-open">
                  {flash ? <p className="saved" role="status">{flash}</p> : null}
                  <div className="note-body">{n.body ? hl(n.body, nq) : "No text yet."}</div>
                  {canEdit ? <div className="row">
                    <button className="btn small" type="button" onClick={() => { setEditing(true); setFlash(""); }}>Edit</button>
                    <ConfirmButton confirm="Click again to delete" onConfirm={() => del(n)}>Delete</ConfirmButton>
                  </div> : null}
                </div>
              ) : null}
            </article>
          );
        }) : sel === "new" ? null : <p className="muted">{d.notes.length ? "No notes match these filters." : "No notes yet. Start with your protocol or first observation."}</p>}
      </div>
    </>
  );
}

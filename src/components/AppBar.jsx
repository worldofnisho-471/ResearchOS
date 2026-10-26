import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago } from "../lib/util.js";
import { Avatar } from "./ui.jsx";
import { useMyProfile } from "./TopBar.jsx";

/** Your notifications across all projects: mentions, and changes to tasks assigned to you. Newest first. */
function useNotifications(me) {
  const [items, setItems] = useState([]);
  const [problem, setProblem] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("notifications").select("*").eq("user_id", me).order("updated_at", { ascending: false }).limit(30);
    if (error) { console.warn("Notifications:", error.message); setProblem(error.message); return; }
    setProblem("");
    const rows = data || [];
    if (!rows.length) { setItems([]); return; }
    const ids = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))];
    const [{ data: tasks }, { data: projects }, { data: people }] = await Promise.all([
      supabase.from("tasks").select("id, title").in("id", ids("task_id")),
      supabase.from("projects").select("id, title").in("id", ids("project_id")),
      supabase.from("profiles").select("id, display_name").in("id", ids("actor_id")),
    ]);
    const by = (list) => Object.fromEntries((list || []).map((x) => [x.id, x]));
    const T = by(tasks), Pj = by(projects), Pe = by(people);
    setItems(rows.map((r) => ({ ...r, task: T[r.task_id]?.title || "a task", project: Pj[r.project_id]?.title || "a project",
      actor: Pe[r.actor_id]?.display_name || "A teammate" })));
  }, [me]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    window.addEventListener("focus", load);
    window.addEventListener("ros-activity", load);  // a teammate changed something in the project you have open
    // Someone who mentions you also pings this channel, so the badge updates at once.
    const ch = supabase.channel("user:" + me);
    ch.on("broadcast", { event: "mention" }, () => load()).subscribe();
    return () => { clearInterval(t); window.removeEventListener("focus", load); window.removeEventListener("ros-activity", load); supabase.removeChannel(ch); };
  }, [me, load]);
  return { items, load, problem };
}

const KIND_LABEL = { mention: "Mention", assigned: "Assigned to you", unassigned: "Reassigned", updated: "Update", comment: "Comment" };

export default function AppBar({ session }) {
  const me = session.user.id;
  const profile = useMyProfile(session);
  const name = (profile && profile.display_name) || session.user.email;
  const { items, load, problem } = useNotifications(me);
  const unread = items.filter((m) => !m.read_at);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const markRead = async (ids) => {
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  };
  const openMention = async (m) => {
    setOpen(false);
    if (!m.read_at) await markRead([m.id]);
    if (m.task_id) go(`p/${m.project_id}/plan/${m.task_id}`); else go(`p/${m.project_id}`);
  };
  const logOut = async () => { await supabase.auth.signOut(); go(""); };

  return (
    <div className="appbar" role="navigation" aria-label="Account">
      <a className="appbar-brand" href="#/"><span className="mark" aria-hidden="true">R</span><span>ResearchOS</span></a>
      <div className="appbar-right">
        <div className="mentions" ref={box}>
          <button className={"appbar-btn" + (unread.length ? " has" : "")} type="button" aria-expanded={open} aria-haspopup="dialog"
            aria-label={unread.length ? `${unread.length} unread notification${unread.length === 1 ? "" : "s"}` : "Notifications"} title="Notifications" onClick={() => setOpen(!open)}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>{unread.length ? <b className="badge">{unread.length}</b> : null}
          </button>
          {open ? (
            <div className="mention-pop" role="dialog" aria-label="Notifications">
              <div className="mention-pop-head">
                <strong>Notifications</strong>
                {unread.length ? <button className="linkbtn" type="button" onClick={() => markRead(unread.map((m) => m.id))}>Mark all read</button> : null}
              </div>
              {problem ? <p className="status err" style={{ padding: "10px 14px" }}>Notifications aren't available: {/does not exist|relation|schema cache/i.test(problem) ? "the notifications table is missing. Re-run schema.sql in Supabase." : problem}</p> : null}
              {items.length ? (
                <ul>
                  {items.map((m) => (
                    <li key={m.id}>
                      <button type="button" className={"mention-item" + (m.read_at ? "" : " unread")} onClick={() => openMention(m)}>
                        <Avatar id={m.actor_id} name={m.actor} size="sm" />
                        <span>
                          <span className="tag">{KIND_LABEL[m.kind] || "Update"}</span>
                          <span><b>{m.actor}</b> {m.summary}</span>
                          <span className="ms-sub">on <b>{m.task}</b> · {m.project} · {ago(m.updated_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted" style={{ padding: "10px 14px", fontSize: ".9rem" }}>Nothing yet. You'll hear here when someone mentions you, or changes, comments on or logs a result for a task assigned to you.</p>}
            </div>
          ) : null}
        </div>
        <button className="appbar-btn who" type="button" onClick={() => go("profile")} title="Your profile and ORCID iD">
          <Avatar id={me} name={name} size="sm" /><span className="who-name">{name}</span>
        </button>
        <button className="appbar-btn" type="button" onClick={logOut}>Log out</button>
      </div>
    </div>
  );
}

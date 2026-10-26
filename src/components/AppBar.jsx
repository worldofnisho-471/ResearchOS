import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago } from "../lib/util.js";
import { Avatar } from "./ui.jsx";
import { useMyProfile } from "./TopBar.jsx";

/** Mentions of you across all your projects: unread first, newest first. */
function useMentions(me) {
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("mentions").select("*").eq("mentioned_user_id", me).order("created_at", { ascending: false }).limit(20);
    const rows = data || [];
    if (!rows.length) { setItems([]); return; }
    const ids = (k) => [...new Set(rows.map((r) => r[k]))];
    const [{ data: tasks }, { data: projects }, { data: comments }, { data: people }] = await Promise.all([
      supabase.from("tasks").select("id, title").in("id", ids("task_id")),
      supabase.from("projects").select("id, title").in("id", ids("project_id")),
      supabase.from("comments").select("id, body").in("id", ids("comment_id")),
      supabase.from("profiles").select("id, display_name").in("id", ids("author_id")),
    ]);
    const by = (list) => Object.fromEntries((list || []).map((x) => [x.id, x]));
    const T = by(tasks), Pj = by(projects), C = by(comments), Pe = by(people);
    setItems(rows.map((r) => ({ ...r, task: T[r.task_id]?.title || "a task", project: Pj[r.project_id]?.title || "a project",
      body: C[r.comment_id]?.body || "", author: Pe[r.author_id]?.display_name || "A teammate" })));
  }, [me]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    window.addEventListener("focus", load);
    // A teammate who mentions you also pings this channel, so the badge updates at once.
    const ch = supabase.channel("user:" + me);
    ch.on("broadcast", { event: "mention" }, () => load()).subscribe();
    return () => { clearInterval(t); window.removeEventListener("focus", load); supabase.removeChannel(ch); };
  }, [me, load]);
  return { items, load };
}

export default function AppBar({ session }) {
  const me = session.user.id;
  const profile = useMyProfile(session);
  const name = (profile && profile.display_name) || session.user.email;
  const { items, load } = useMentions(me);
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
    await supabase.from("mentions").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  };
  const openMention = async (m) => {
    setOpen(false);
    if (!m.read_at) await markRead([m.id]);
    go(`p/${m.project_id}/plan/${m.task_id}`);
  };
  const logOut = async () => { await supabase.auth.signOut(); go(""); };

  return (
    <div className="appbar" role="navigation" aria-label="Account">
      <a className="appbar-brand" href="#/"><span className="mark" aria-hidden="true">R</span><span>ResearchOS</span></a>
      <div className="appbar-right">
        <div className="mentions" ref={box}>
          <button className={"appbar-btn" + (unread.length ? " has" : "")} type="button" aria-expanded={open} aria-haspopup="dialog"
            aria-label={unread.length ? `${unread.length} unread mention${unread.length === 1 ? "" : "s"}` : "Mentions"} onClick={() => setOpen(!open)}>
            <span aria-hidden="true">@</span>{unread.length ? <b className="badge">{unread.length}</b> : null}
          </button>
          {open ? (
            <div className="mention-pop" role="dialog" aria-label="Mentions">
              <div className="mention-pop-head">
                <strong>Mentions</strong>
                {unread.length ? <button className="linkbtn" type="button" onClick={() => markRead(unread.map((m) => m.id))}>Mark all read</button> : null}
              </div>
              {items.length ? (
                <ul>
                  {items.map((m) => (
                    <li key={m.id}>
                      <button type="button" className={"mention-item" + (m.read_at ? "" : " unread")} onClick={() => openMention(m)}>
                        <Avatar id={m.author_id} name={m.author} size="sm" />
                        <span>
                          <span><b>{m.author}</b> mentioned you on <b>{m.task}</b></span>
                          <span className="ms-sub">{m.project} · {ago(m.created_at)}</span>
                          {m.body ? <span className="mention-snip">{m.body.length > 110 ? m.body.slice(0, 110) + "…" : m.body}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted" style={{ padding: "10px 14px", fontSize: ".9rem" }}>No mentions yet. When a teammate types @ and your name in a comment, it shows up here.</p>}
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

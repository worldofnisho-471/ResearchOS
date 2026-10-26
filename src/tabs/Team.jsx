import { useState } from "react";
import { useP } from "../lib/project.jsx";
import { ai, supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago, linkFor, linkKey, ROLE_INFO, ROLES, TAB_NAMES, titleKey } from "../lib/util.js";
import { Avatar, ConfirmButton, useBusy } from "../components/ui.jsx";

const inviteLink = (token) => `${window.location.origin}${window.location.pathname}#/invite/${token}`;

function inviteMessage(inv, title) {
  const subject = `Join "${title || "our project"}" on ResearchOS`;
  const body = `Hi,\n\nI've added you to our research project "${title || "our project"}" on ResearchOS as a ${inv.role}.\n\nTo join, open this link and sign in (or create an account) with ${inv.email}:\n${inviteLink(inv.token)}\n\nThe link works for 14 days.`;
  return { subject, body };
}

/** Ways to send an invite: web Gmail / Outlook (work without a desktop mail app), the computer's mail app, or copy. */
function SendInvite({ inv, primary }) {
  const { d, toast } = useP();
  const { subject, body } = inviteMessage(inv, d.project.title);
  const q = (o) => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const gmail = "https://mail.google.com/mail/?" + q({ view: "cm", fs: "1", to: inv.email, su: subject, body });
  const outlook = "https://outlook.live.com/mail/0/deeplink/compose?" + q({ to: inv.email, subject, body });
  const mailto = `mailto:${inv.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = async (text, ok) => {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast("Couldn't copy automatically. Select the link and copy it."); }
  };
  const cls = "btn small" + (primary ? " primary" : "");
  return (
    <div className="row" style={{ gap: 6 }}>
      <a className={cls} href={gmail} target="_blank" rel="noopener">Send with Gmail</a>
      <a className="btn small" href={outlook} target="_blank" rel="noopener">Send with Outlook</a>
      <button className="btn small" type="button" onClick={() => copy(`${subject}\n\n${body}`, "Invite message copied. Paste it into any email or chat.")}>Copy message</button>
      <button className="btn small" type="button" onClick={() => copy(inviteLink(inv.token), "Invite link copied.")}>Copy link only</button>
      <a className="linkbtn" href={mailto}>Use my computer's mail app</a>
    </div>
  );
}

function Invites() {
  const P = useP();
  const { d, pid, me, run, act, toast } = P;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Researcher");
  const [last, setLast] = useState(null);
  const [open, setOpen] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) { toast("Enter a valid email address."); return; }
    const res = await run(supabase.from("invites").insert({ project_id: pid, email: em, role, invited_by: me }).select().single(), ["invites"]);
    if (!res) return;
    act(`invited ${em} as a ${role}`);
    setLast(res); setEmail("");
  };
  const cancel = async (inv) => {
    if (await run(supabase.from("invites").delete().eq("id", inv.id), ["invites"], "Invite cancelled. Its link no longer works.")) {
      act(`cancelled the invite for ${inv.email}`);
      if (last && last.id === inv.id) setLast(null);
    }
  };
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3>Invite a teammate</h3>
      <form className="grid" onSubmit={submit}>
        <div className="field"><label className="label" htmlFor="i-email">Email</label><input id="i-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@university.edu" /></div>
        <div className="field"><label className="label" htmlFor="i-role">Role</label><select id="i-role" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="row field wide"><button className="btn primary" type="submit">Create invite</button><span className="ms-sub">ResearchOS makes a private link; you send it. They join by signing in with that email. Links last 14 days.</span></div>
      </form>
      {last && d.invites.some((x) => x.id === last.id) ? (
        <div className="diag">
          <span className="label">Invite ready for {last.email}</span>
          <p style={{ fontSize: ".9rem" }}>Send it now. Gmail and Outlook open a ready-written email in a new tab.</p>
          <SendInvite inv={last} primary />
          <div className="copybox"><input readOnly value={inviteLink(last.token)} aria-label="Invite link" onFocus={(e) => e.target.select()} /></div>
        </div>
      ) : null}
      {d.invites.length ? (
        <div>
          <span className="label">Waiting to join · {d.invites.length}</span>
          <p className="ms-sub">Invites that haven't been accepted yet. Send one again, or cancel it so its link stops working.</p>
          {d.invites.map((inv) => {
            const expired = Date.parse(inv.expires_at) < Date.now();
            return (
              <div className="member" key={inv.id} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}><strong style={{ overflowWrap: "anywhere" }}>{inv.email}</strong>
                    <div className="sub2">{inv.role} · {expired ? "expired, so create a new invite" : "invited " + ago(inv.created_at)}</div></div>
                  <div className="row" style={{ gap: 6 }}>
                    {!expired ? <button className="btn small" type="button" aria-expanded={open === inv.id} onClick={() => setOpen(open === inv.id ? null : inv.id)}>{open === inv.id ? "Hide" : "Send again"}</button> : null}
                    <ConfirmButton className="btn small danger" confirm="Click again to cancel" onConfirm={() => cancel(inv)}>Cancel invite</ConfirmButton>
                  </div>
                </div>
                {open === inv.id ? <SendInvite inv={inv} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function Publications() {
  const P = useP();
  const { d, pid, me, canEdit, run, act, name, reload, profiles } = P;
  const { isBusy, run: runAi, Status } = useBusy();
  const blank = () => ({ title: "", year: "", link: "", abstract: "" });
  const [rows, setRows] = useState([blank()]);
  const [errs, setErrs] = useState([]);
  const setRow = (i, k) => (e) => { const v = e.target.value; setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setErrs([]); };
  const [result, setResult] = useState("");
  const withOrcid = d.members.filter((m) => profiles[m.user_id]?.orcid).length;
  const myOrcid = profiles[me]?.orcid;

  const importOrcid = async () => {
    const out = await runAi("orcid", (pr) => ai("import-works", pid, {}, pr));
    if (!out) return;
    await reload("publications", "activity");
    setResult(out.members_with_orcid ? `Imported ${out.added} new publication${out.added === 1 ? "" : "s"} from ${out.members_with_orcid} ORCID record${out.members_with_orcid === 1 ? "" : "s"}.` : "Nobody on the team has added an ORCID iD yet.");
  };
  const add = async (e) => {
    e.preventDefault();
    const filled = rows.map((r, i) => ({ ...r, i })).filter((r) => r.title.trim() || r.link.trim() || r.year || r.abstract.trim());
    const errors = [];
    if (!filled.length) errors[0] = "Add at least one title.";
    // Already in the list (from ORCID or added before), matched by title or DOI/link
    const haveTitle = new Map(d.publications.map((p) => [titleKey(p.title), p.title]));
    const haveLink = new Map(d.publications.filter((p) => linkKey(p.doi_or_url)).map((p) => [linkKey(p.doi_or_url), p.title]));
    const seenTitle = new Map(), seenLink = new Map();
    for (const r of filled) {
      const tk = titleKey(r.title), lk = linkKey(r.link), y = Number(r.year);
      if (!r.title.trim()) errors[r.i] = "Add a title.";
      else if (r.link.trim() && !linkFor(r.link)) errors[r.i] = "That isn't a DOI or link. Leave it blank, or paste something like 10.1021/… or https://…";
      else if (r.year && (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear() + 1)) errors[r.i] = "Check the year.";
      else if (haveTitle.has(tk)) errors[r.i] = `Already in the list: "${haveTitle.get(tk)}".`;
      else if (lk && haveLink.has(lk)) errors[r.i] = `This DOI or link is already in the list, as "${haveLink.get(lk)}".`;
      else if (seenTitle.has(tk)) errors[r.i] = `Same title as publication ${seenTitle.get(tk) + 1} above.`;
      else if (lk && seenLink.has(lk)) errors[r.i] = `Same DOI or link as publication ${seenLink.get(lk) + 1} above.`;
      seenTitle.set(tk, r.i); if (lk) seenLink.set(lk, r.i);
    }
    if (errors.some(Boolean)) { setErrs(errors); return; }
    const insert = filled.map((r) => ({ project_id: pid, member_id: me, title: r.title.trim(), year: Number(r.year) || null, doi_or_url: linkFor(r.link) || "", abstract: r.abstract.trim(), source: "manual" }));
    if (await run(supabase.from("publications").insert(insert), ["publications"], `Added ${insert.length} publication${insert.length === 1 ? "" : "s"}.`)) {
      act(insert.length === 1 ? `added the publication "${insert[0].title}"` : `added ${insert.length} publications`);
      setRows([blank()]); setErrs([]);
    }
  };
  const list = d.publications.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  return (
    <section className="corpus">
      <div className="panel-head">
        <div>
          <h3>Team publications · {list.length}</h3>
          <p className="muted" style={{ fontSize: ".88rem" }}>Your group's published work. When an idea scores low, related directions build on it. {withOrcid} of {d.members.length} member{d.members.length === 1 ? "" : "s"} added an ORCID iD.</p>
        </div>
        {canEdit ? <div className="row"><button className="btn small primary" type="button" disabled={isBusy("orcid")} onClick={importOrcid}>Import from ORCID</button></div> : null}
      </div>
      <Status k="orcid" text="Reading public ORCID records…" />
      {result ? <p className="saved" role="status">{result}</p> : null}
      {!myOrcid ? <p className="ms-sub">You haven't added your ORCID iD. <button className="linkbtn" type="button" onClick={() => go("profile")}>Add it on your profile</button></p> : null}
      <ul className="pubs">
        {list.length ? list.map((p) => (
          <li className="pub" key={p.id}>
            <div>
              <strong>{p.title}</strong>
              <span className="ms-sub">{[p.year, p.source === "orcid" ? "from ORCID" : "added by hand", p.member_id ? name(p.member_id) : null].filter(Boolean).join(" · ")}{(p.topics || []).length ? " · " + p.topics.join(", ") : ""}</span>
              {p.abstract ? <p className="muted" style={{ fontSize: ".84rem" }}>{p.abstract.slice(0, 260)}{p.abstract.length > 260 ? "…" : ""}</p> : null}
              {linkFor(p.doi_or_url) ? <a href={linkFor(p.doi_or_url)} target="_blank" rel="noopener" style={{ fontSize: ".82rem", overflowWrap: "anywhere" }}>{p.doi_or_url}</a>
                : p.doi_or_url ? <span className="ms-sub" style={{ overflowWrap: "anywhere" }}>{p.doi_or_url}</span> : null}
            </div>
            {canEdit ? <button className="linkbtn" type="button" onClick={() => run(supabase.from("publications").delete().eq("id", p.id), ["publications"])}>Remove</button> : null}
          </li>
        )) : <li className="muted">No publications yet. Add ORCID iDs and import, or add them by hand.</li>}
      </ul>
      {canEdit ? (
        <details className="pub-add">
          <summary>Add publications by hand</summary>
          <form className="pub-forms" onSubmit={add}>
            {rows.map((r, i) => {
              const id = (k) => (i ? `${k}-${i}` : k);
              return (
                <fieldset className="pub-form" key={i}>
                  <legend className="label">Publication {i + 1}</legend>
                  {rows.length > 1 ? <button className="linkbtn pub-remove" type="button" aria-label={`Remove publication ${i + 1}`} onClick={() => { setRows((x) => x.filter((_, j) => j !== i)); setErrs([]); }}>Remove</button> : null}
                  <div className="grid">
                    <div className="field wide"><label className="label" htmlFor={id("cp-title")}>Title</label><input id={id("cp-title")} value={r.title} onChange={setRow(i, "title")} placeholder="Paper, thesis, patent or report title" /></div>
                    <div className="field"><label className="label" htmlFor={id("cp-year")}>Year (optional)</label><input id={id("cp-year")} type="number" min="1900" max="2100" value={r.year} onChange={setRow(i, "year")} /></div>
                    <div className="field"><label className="label" htmlFor={id("cp-link")}>DOI or link (optional)</label><input id={id("cp-link")} value={r.link} onChange={setRow(i, "link")} placeholder="10.1021/… or https://…" /></div>
                    <div className="field wide"><label className="label" htmlFor={id("cp-abs")}>Abstract or 2-line summary (optional)</label><textarea id={id("cp-abs")} style={{ minHeight: 70 }} value={r.abstract} onChange={setRow(i, "abstract")} /></div>
                  </div>
                  {errs[i] ? <p className="status err" role="alert">{errs[i]}</p> : null}
                </fieldset>
              );
            })}
            <div className="row">
              <button className="btn small" type="button" onClick={() => setRows((x) => [...x, blank()])} aria-label="Add another publication">+ Add another</button>
              <button className="btn small primary" type="submit">{rows.length > 1 ? `Save ${rows.length} publications` : "Add publication"}</button>
            </div>
          </form>
        </details>
      ) : null}
    </section>
  );
}

export default function Team() {
  const P = useP();
  const { d, pid, me, isLead, online, name, run, act, profiles, toast } = P;
  const onIds = online.map((o) => o.id);

  const setRole = async (m, role) => {
    if (await run(supabase.from("project_members").update({ role }).eq("project_id", pid).eq("user_id", m.user_id), ["members"])) act(`made ${name(m.user_id)} a ${role}`, m.user_id);
  };
  const remove = async (m) => {
    if (await run(supabase.from("project_members").delete().eq("project_id", pid).eq("user_id", m.user_id), ["members"])) act(`removed ${name(m.user_id)} from the project`, m.user_id);
  };
  const delProject = async () => {
    const { error } = await supabase.from("projects").delete().eq("id", pid);
    if (error) { toast(error.message); return; }
    toast("Project deleted."); go("");
  };

  return (
    <>
      <div className="panel-head"><div>
        <span className="label">Team</span><h2>Who's on the team</h2>
        <p className="muted">{isLead ? "Invite teammates by email and choose their role. You can change roles at any time." : "Roles are set by a Lead. Your role decides what you can change."}</p>
      </div></div>
      <div className="team-grid">
        <section>
          <h3>People · {d.members.length}</h3>
          <div>
            {d.members.map((m) => {
              const isOn = onIds.includes(m.user_id);
              const st = online.find((o) => o.id === m.user_id)?.tab;
              const open = d.tasks.filter((t) => t.assignee_id === m.user_id && t.status !== "Done").length;
              const orcid = profiles[m.user_id]?.orcid;
              return (
                <div className="member" key={m.user_id}>
                  <Avatar id={m.user_id} name={name(m.user_id)} size="md" />
                  <div style={{ minWidth: 0 }}>
                    <strong>{name(m.user_id)}{m.user_id === me ? " (you)" : ""}</strong>
                    <div className="sub2">
                      {isOn ? <span className="dot" /> : null}
                      {isOn ? `Here now${st && TAB_NAMES[st] ? " · " + TAB_NAMES[st] : ""}` : m.last_seen ? "Last active " + ago(m.last_seen) : "Not seen yet"}
                      {` · ${open} open task${open === 1 ? "" : "s"}`}
                      {orcid ? <> · <a href={`https://orcid.org/${orcid}`} target="_blank" rel="noopener">ORCID</a></> : " · no ORCID"}
                    </div>
                  </div>
                  {isLead && m.user_id !== me ? (
                    <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                      <select className="move" aria-label={"Role for " + name(m.user_id)} value={m.role} onChange={(e) => setRole(m, e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                      <ConfirmButton className="linkbtn" confirm="Click again to remove" onConfirm={() => remove(m)}>Remove</ConfirmButton>
                    </div>
                  ) : <span className="role">{m.role}</span>}
                </div>
              );
            })}
          </div>
          {isLead ? <Invites /> : null}
          <h3>Roles</h3>
          <div className="table-wrap"><table className="roles">
            <thead><tr><th>Role</th><th>What they can do</th></tr></thead>
            <tbody>{ROLES.map((k) => <tr key={k}><td><strong>{k}</strong></td><td>{ROLE_INFO[k]}</td></tr>)}</tbody>
          </table></div>
          <p className="ms-sub">Roles are enforced by the database, not just hidden in the app. A project always keeps at least one Lead.</p>
        </section>
        <section>
          <h3>Recent activity</h3>
          <ul className="feed">
            {d.activity.length ? d.activity.map((a) => (
              <li key={a.id}><Avatar id={a.actor_id} name={name(a.actor_id)} size="sm" />
                <div><span><strong>{a.actor_id === me ? "You" : name(a.actor_id)}</strong> {a.text}</span><span className="when">{ago(a.created_at)}</span></div></li>
            )) : <li className="muted" style={{ display: "block" }}>No activity yet.</li>}
          </ul>
        </section>
      </div>
      <Publications />
      {isLead ? (
        <section className="danger-zone">
          <h3>Project admin</h3>
          <p className="muted" style={{ fontSize: ".88rem" }}>Deleting removes this project's plan, results, notes and comments for everyone, and can't be undone.</p>
          <div className="row"><ConfirmButton confirm={`Click again to delete "${d.project.title || "this project"}" for everyone`} onConfirm={delProject}>Delete this project</ConfirmButton></div>
        </section>
      ) : null}
    </>
  );
}

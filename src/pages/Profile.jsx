import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { normOrcid } from "../lib/util.js";
import { useToast } from "../components/Toast.jsx";
import TopBar from "../components/TopBar.jsx";

export default function Profile({ session }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [orcid, setOrcid] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.display_name || ""); setOrcid(data.orcid || ""); }
    });
  }, [session.user.id]);

  const save = async (e) => {
    e.preventDefault();
    const o = orcid.trim() ? normOrcid(orcid) : null;
    if (orcid.trim() && !o) { setMsg({ text: "That doesn't look like an ORCID iD. It has 16 digits, like 0000-0002-1825-0097.", err: true }); return; }
    const { error } = await supabase.from("profiles").upsert({ id: session.user.id, display_name: name.trim() || session.user.email.split("@")[0], orcid: o });
    if (error) { setMsg({ text: error.message, err: true }); return; }
    if (pw) {
      if (pw.length < 8) { setMsg({ text: "Use at least 8 characters for the new password.", err: true }); return; }
      const { error: e2 } = await supabase.auth.updateUser({ password: pw });
      if (e2) { setMsg({ text: e2.message, err: true }); return; }
      setPw("");
    }
    setOrcid(o || "");
    setMsg({ text: "Saved.", err: false });
    toast("Profile saved.");
  };

  return (
    <div className="wrap">
      <TopBar session={session} crumb title="Your profile" />
      <main className="panel">
        <div className="panel-head"><div>
          <span className="label">Profile</span>
          <h2>How your team sees you</h2>
          <p className="muted">Your ORCID iD lets ResearchOS import your public publications, so related directions can build on work you've already done. Only your public ORCID record is read.</p>
        </div></div>
        <form className="grid" onSubmit={save}>
          <div className="field"><label className="label" htmlFor="p-name">Display name</label><input id="p-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="p-email">Email</label><input id="p-email" value={session.user.email} disabled /></div>
          <div className="field"><label className="label" htmlFor="p-orcid">ORCID iD</label>
            <input id="p-orcid" value={orcid} onChange={(e) => setOrcid(e.target.value)} placeholder="0000-0002-1825-0097" />
            <span className="ms-sub">Find yours at <a href="https://orcid.org" target="_blank" rel="noopener">orcid.org</a>. Leave blank if you don't have one.</span></div>
          <div className="field"><label className="label" htmlFor="p-pw">New password (optional)</label><input id="p-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
          <div className="row field wide">
            <button className="btn primary" type="submit">Save profile</button>
            <button className="btn" type="button" onClick={() => go("")}>Back to projects</button>
            <p className={"status" + (msg.err ? " err" : "")} role="status">{msg.text}</p>
          </div>
        </form>
        <div className="row"><button className="btn small" type="button" onClick={() => supabase.auth.signOut().then(() => go(""))}>Sign out</button></div>
      </main>
    </div>
  );
}

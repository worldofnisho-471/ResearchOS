import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import Auth from "./Auth.jsx";

export default function Invite({ token, session }) {
  const [inv, setInv] = useState(undefined);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("invite_preview", { invite_token: token }).then(({ data, error }) => setInv(error ? null : (data && data[0]) || null));
  }, [token]);

  if (inv === undefined) return <div className="loading">Loading the invite…</div>;
  if (!inv) return <Box title="This invite link isn't valid" text="Ask the project Lead to send you a new one." />;
  if (inv.used && !session) return <Box title="This invite has already been used" text="If it was you, sign in to see the project." action={<a className="btn" href="#/">Sign in</a>} />;
  if (inv.expired) return <Box title="This invite has expired" text="Invites last 14 days. Ask the project Lead for a new one." />;
  if (!session) return <Auth email={inv.email} initialMode="signup" intro={`You've been invited to join "${inv.project_title}" as a ${inv.role}. Create an account (or sign in) with ${inv.email} to accept.`} />;

  const wrongEmail = session.user.email.toLowerCase() !== String(inv.email).toLowerCase();
  const accept = async () => {
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("accept_invite", { invite_token: token });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    go(`p/${data}/dash`);
  };
  return (
    <Box title={`Join "${inv.project_title}"`} text={wrongEmail
      ? `This invite was sent to ${inv.email}, but you're signed in as ${session.user.email}. Sign out and sign in with ${inv.email} to accept it.`
      : `You'll join as a ${inv.role}. You can see everything on the project once you join.`}
      action={wrongEmail
        ? <button className="btn" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        : <button className="btn primary" type="button" onClick={accept} disabled={busy}>{busy ? "Joining…" : "Accept and open the project"}</button>}
      msg={msg} />
  );
}

function Box({ title, text, action, msg }) {
  return (
    <div className="wrap auth">
      <div className="brand"><div className="mark" aria-hidden="true">R</div><h1>ResearchOS</h1></div>
      <main className="panel">
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        {action ? <div className="row">{action}<p className="status err" role="status">{msg}</p></div> : null}
      </main>
    </div>
  );
}

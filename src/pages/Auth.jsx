import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Auth({ email: fixedEmail, intro, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(fixedEmail || "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ text: "", err: false });
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for the password.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() || email.split("@")[0] }, emailRedirectTo: window.location.href },
        });
        if (error) throw error;
        if (!data.session) setMsg({ text: "Check your email for a confirmation link, then come back and sign in.", err: false });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/#/profile" });
        if (error) throw error;
        setMsg({ text: "If that email has an account, a reset link is on its way.", err: false });
      }
    } catch (e2) {
      setMsg({ text: e2.message === "Invalid login credentials" ? "That email and password don't match an account." : e2.message, err: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="wrap auth">
      <div className="brand"><div className="mark" aria-hidden="true">R</div><h1>ResearchOS</h1></div>
      <main className="panel">
        <div className="panel-head"><div>
          <h2>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password"}</h2>
          <p className="muted">{intro || "From research idea to validated result, for the whole team."}</p>
        </div></div>
        <form onSubmit={submit}>
          {mode === "signup" ? (
            <div className="field"><label className="label" htmlFor="a-name">Your name</label>
              <input id="a-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Ananya Rao" /></div>
          ) : null}
          <div className="field"><label className="label" htmlFor="a-email">Email</label>
            <input id="a-email" type="email" required value={email} disabled={!!fixedEmail} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          {mode !== "reset" ? (
            <div className="field"><label className="label" htmlFor="a-pass">Password</label>
              <input id="a-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
          ) : null}
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
            <p className={"status" + (msg.err ? " err" : "")} role="status">{busy ? "One moment…" : msg.text}</p>
          </div>
        </form>
        <div className="linkrow muted">
          {mode !== "signin" ? <button className="linkbtn" type="button" onClick={() => setMode("signin")}>I have an account</button> : null}
          {mode !== "signup" ? <button className="linkbtn" type="button" onClick={() => setMode("signup")}>Create an account</button> : null}
          {mode === "signin" ? <button className="linkbtn" type="button" onClick={() => setMode("reset")}>Forgot password?</button> : null}
        </div>
      </main>
    </div>
  );
}

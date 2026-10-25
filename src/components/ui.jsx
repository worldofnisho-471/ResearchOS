import { useState } from "react";

const COLORS = ["#2c46d4", "#1d7f54", "#9a6512", "#b8382f", "#6b3fc9", "#0f7a8a", "#a33f7a", "#4a5168"];
const colorFor = (id) => COLORS[[...String(id || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (n) => String(n || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export function Avatar({ id, name, size = "" }) {
  if (!id) return <span className={"av " + size} aria-hidden="true" />;
  return <span className={"av initials " + size} style={{ background: colorFor(id) }} aria-hidden="true" title={name}>{initials(name)}</span>;
}

export const Chevron = () => (
  <span className="chev" aria-hidden="true">
    <svg viewBox="0 0 16 16" width="16" height="16"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

export const Pill = ({ cls, children }) => <span className={"pill " + cls}>{children}</span>;

/** A button that asks for a second click before doing something destructive. */
export function ConfirmButton({ className = "btn small danger", confirm, onConfirm, children, disabled }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={className} type="button" disabled={disabled}
      onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); onConfirm(); }}
      onBlur={() => setArmed(false)}>
      {armed ? confirm : children}
    </button>
  );
}

/** Runs an async AI call and shows progress or the error next to its button. */
export function useBusy() {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (key, fn) => {
    setBusy(key); setErr(null);
    try { return await fn(); }
    catch (e) { setErr({ key, msg: e.message || "Something went wrong. Try again." }); return null; }
    finally { setBusy(null); }
  };
  const Status = ({ k, text = "Working… this can take up to a minute." }) => (
    <p className={"status" + (err && err.key === k ? " err" : "")} role="status">
      {busy === k ? text : err && err.key === k ? err.msg : ""}
    </p>
  );
  return { busy, run, Status, setErr };
}

export function hl(text, q) {
  text = String(text || "");
  if (!q) return text;
  const out = []; const low = text.toLowerCase();
  let i = 0, j, k = 0;
  while ((j = low.indexOf(q, i)) !== -1) {
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={k++}>{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  out.push(text.slice(i));
  return out;
}
export function snippet(body, q) {
  const j = q ? body.toLowerCase().indexOf(q) : -1;
  return j < 90 ? body : "…" + body.slice(Math.max(0, j - 60));
}

import { useRef, useState } from "react";
import { Avatar } from "./ui.jsx";

/** A textarea where typing "@" offers the project's members to mention. */
export default function MentionBox({ value, onChange, people, id, placeholder, label }) {
  const ref = useRef(null);
  const [q, setQ] = useState(null);   // text typed after "@", or null when the list is closed
  const [at, setAt] = useState(0);    // where that "@" is
  const [sel, setSel] = useState(0);
  const matches = q === null ? [] : people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  const scan = (text, caret) => {
    const before = text.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]{0,30})$/);
    if (m) { setQ(m[2]); setAt(caret - m[2].length - 1); setSel(0); } else setQ(null);
  };
  const pick = (p) => {
    const caret = ref.current ? ref.current.selectionStart : value.length;
    const next = value.slice(0, at) + "@" + p.name + " " + value.slice(caret);
    onChange(next); setQ(null);
    requestAnimationFrame(() => { const pos = at + p.name.length + 2; ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };
  const onKey = (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setQ(null); }
  };
  return (
    <div className="mention-box">
      <textarea id={id} ref={ref} aria-label={label} placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value); scan(e.target.value, e.target.selectionStart); }}
        onKeyDown={onKey} onClick={(e) => scan(value, e.target.selectionStart)} onBlur={() => setTimeout(() => setQ(null), 150)}
        aria-autocomplete="list" aria-expanded={matches.length > 0} />
      {matches.length ? (
        <ul className="mention-list" role="listbox" aria-label="People to mention">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === sel}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }} className={i === sel ? "on" : ""}>
                <Avatar id={p.id} name={p.name} size="sm" /> {p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

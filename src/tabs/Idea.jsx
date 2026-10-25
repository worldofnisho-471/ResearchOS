import { useEffect, useState } from "react";
import { useP } from "../lib/project.jsx";
import { ai } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { clamp, evidenceCounts, GOALS, pillClass } from "../lib/util.js";
import { useBusy } from "../components/ui.jsx";
import { getDraft, setDraft } from "../lib/jobs.js";
import Directions from "../components/Directions.jsx";
import Commercial from "../components/Commercial.jsx";

export default function Idea() {
  const P = useP();
  const { d, pid, isLead, reload } = P;
  const p = d.project;
  const a = p.assessment;
  const draftId = pid + ":idea-form";
  const fromProject = () => ({ title: p.title, text: p.idea_text, field: p.field, goal: p.goal });
  // Unsaved edits are kept outside this tab, so they survive switching tabs.
  const [f, setF] = useState(() => getDraft(draftId) || fromProject());
  const [armed, setArmed] = useState(false);
  const { isBusy, run, Status, setErr } = useBusy();

  // Keep the form in step with edits other people make, unless you have unsaved changes.
  useEffect(() => { if (!getDraft(draftId)) setF(fromProject()); }, [p.title, p.idea_text, p.field, p.goal]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => { const n = { ...x, [k]: e.target.value }; setDraft(draftId, n); return n; });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim() || !f.text.trim()) { setErr({ key: "idea", msg: "Add a title and a short description of the idea." }); return; }
    if (d.tasks.length && !armed) { setArmed(true); setErr({ key: "idea", msg: "This replaces the plan, results and review for everyone on the project. Click again to confirm." }); return; }
    setArmed(false);
    const idea = { ...f };
    setDraft(draftId, idea);
    // Everything after the call runs even if you've moved to another tab.
    const out = await run("idea", (pr) => ai("assess", pid, { idea }, pr));
    if (!out) return;
    setDraft(draftId, undefined);
    await reload("project", "papers", "tasks", "results", "reviews", "directions", "evidence", "activity");
    if (out.suggestDirections) {
      if (await run("dirs", (pr) => ai("directions", pid, {}, pr))) await reload("directions", "publications", "activity");
    }
  };

  const sub = (label, o) => (
    <div className="sub">
      <div className="sub-top"><span>{label}</span><span>{clamp(o && o.score)}</span></div>
      <div className="bar"><i style={{ width: clamp(o && o.score) + "%" }} /></div>
      <p className="muted" style={{ fontSize: ".86rem" }}>{(o && o.reason) || ""}</p>
    </div>
  );
  const ec = evidenceCounts(a, d.evidence);
  const C = 2 * Math.PI * 64, score = clamp(p.viability_score);

  return (
    <>
      <div className="panel-head"><div>
        <span className="label">Stage 1</span>
        <h2>Is this idea worth pursuing?</h2>
        <p className="muted">Get a viability score, the main challenges and open gaps, checked against real papers from Semantic Scholar.</p>
        {!isLead ? <p className="muted" style={{ fontSize: ".85rem" }}>Only Leads can change the idea or re-run the check.</p> : null}
      </div></div>

      <form className="grid" onSubmit={submit}>
        <fieldset disabled={!isLead || isBusy("idea")} style={{ display: "contents" }}>
          <div className="field wide"><label className="label" htmlFor="f-title">Idea title</label>
            <input id="f-title" value={f.title} onChange={set("title")} placeholder="e.g. Paper-strip nitrate test read by a phone camera" /></div>
          <div className="field wide"><label className="label" htmlFor="f-text">Describe the idea in 2–5 sentences</label>
            <textarea id="f-text" value={f.text} onChange={set("text")} placeholder="What it is, who it helps, and how you would test it." /></div>
          <div className="field"><label className="label" htmlFor="f-field">Field</label>
            <input id="f-field" value={f.field} onChange={set("field")} placeholder="e.g. Materials science" /></div>
          <div className="field"><label className="label" htmlFor="f-goal">Goal</label>
            <select id="f-goal" value={f.goal} onChange={set("goal")}>{GOALS.map((g) => <option key={g}>{g}</option>)}</select></div>
        </fieldset>
        <div className="row field wide">
          {isLead ? <button className="btn primary" type="submit" disabled={isBusy("idea")}>{a ? "Re-run idea check" : "Check this idea"}</button> : null}
          <Status k="idea" text="Searching papers and assessing the idea… this can take up to a minute." />
        </div>
      </form>

      {a ? (
        <>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: 0, width: "100%" }} />
          <div className="verdict-grid">
            <div className="ring">
              <svg viewBox="0 0 160 160" aria-hidden="true">
                <circle cx="80" cy="80" r="64" fill="none" stroke="var(--line)" strokeWidth="12" />
                <circle cx="80" cy="80" r="64" fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * C} ${C}`} />
              </svg>
              <div className="val"><div><div className="num">{score}</div><div className="label">viability / 100</div></div></div>
            </div>
            <div className="subs">
              <div className="row"><span className={"pill " + pillClass(p.verdict)}>Verdict: {p.verdict}</span></div>
              <p>{a.summary}</p>
              {sub("Novelty", a.novelty)}{sub("Feasibility", a.feasibility)}{sub("Commercial potential", a.commercial_potential)}
              <p className="ms-sub">{ec.n ? `Commercial potential is an AI estimate: ${ec.conf} of its ${ec.n} assumptions are backed by evidence${ec.rej ? `, ${ec.rej} rejected` : ""}. See the commercial case below.` : "Commercial potential is an AI estimate."}</p>
            </div>
          </div>
          <div className="cols">
            <section><h3>Key challenges</h3><ul className="clean">{(a.challenges || []).map((c, i) => <li key={i}>{c}</li>)}</ul></section>
            <section><h3>Gaps to explore</h3><ul className="clean">{(a.gaps || []).map((c, i) => <li key={i}>{c}</li>)}</ul></section>
            <section>
              <h3>Papers found · {d.papers.length}</h3>
              <p className="muted" style={{ fontSize: ".85rem" }}>From Semantic Scholar. The assessment only discusses these papers.</p>
              <div className="papers">
                {d.papers.length ? d.papers.map((x) => (
                  <a key={x.id} href={x.url || `https://www.semanticscholar.org/search?q=${encodeURIComponent(x.title)}`} target="_blank" rel="noopener">
                    <strong style={{ fontSize: ".9rem" }}>{x.title}</strong>
                    <span className="ms-sub">{x.year || "n.d."}{x.relevance_note ? " · " + x.relevance_note : ""}</span>
                  </a>
                )) : <p className="muted">No papers came back for this idea. Try a more specific title.</p>}
              </div>
            </section>
          </div>
          <Directions />
          <Commercial />
          <div className="row">
            <button className="btn primary" type="button" onClick={() => go(`p/${pid}/plan`)}>{d.tasks.length ? "Go to research plan" : "Build the research plan"}</button>
          </div>
        </>
      ) : !isLead ? <div className="empty"><p>No idea check yet. A Lead can run it.</p></div> : null}
    </>
  );
}

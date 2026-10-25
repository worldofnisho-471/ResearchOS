import { useState } from "react";
import { useP } from "../lib/project.jsx";
import { ai, supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { ago, clamp, DIR_THRESHOLD, isUrl } from "../lib/util.js";
import { useBusy } from "./ui.jsx";

const SUBS = [["fit", "Fit with your work"], ["momentum", "Research and funding momentum"], ["commercial_pull", "Commercial pull"], ["room", "Room to contribute"], ["feasibility", "Feasibility"]];

function Spark({ rows, label }) {
  if (!rows || rows.length < 2) return null;
  const max = Math.max(1, ...rows.map((r) => r.count ?? r.projects ?? 0));
  const W = 120, H = 28;
  const pts = rows.map((r, i) => `${(i / (rows.length - 1)) * W},${H - ((r.count ?? r.projects ?? 0) / max) * (H - 4) - 2}`).join(" ");
  const first = rows[0], last = rows[rows.length - 1];
  const v = (r) => r.count ?? r.projects ?? 0;
  return (
    <div className="row" style={{ gap: 8, fontSize: ".8rem" }}>
      <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${v(first)} in ${first.year} to ${v(last)} in ${last.year}`}>
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="muted">{label}: {v(first).toLocaleString()} ({first.year}) → {v(last).toLocaleString()} ({last.year})</span>
    </div>
  );
}

export default function Directions() {
  const P = useP();
  const { d, pid, me, canEdit, reload, directions: dir, name, toast } = P;
  const p = d.project;
  const low = p.viability_score != null && (clamp(p.viability_score) < DIR_THRESHOLD || p.verdict === "Rethink");
  const [open, setOpen] = useState(false);
  const { isBusy, run, Status } = useBusy();

  const suggest = async () => {
    const out = await run("dirs", (pr) => ai("directions", pid, {}, pr));
    if (out) await reload("directions", "publications", "activity");
  };


  const startFrom = async (s) => {
    const { data, error } = await supabase.from("projects").insert({
      title: s.title, idea_text: [s.pitch, s.first_experiment ? "First experiment: " + s.first_experiment : ""].filter(Boolean).join(" "),
      field: p.field, goal: p.goal, from_project: pid, created_by: me,
    }).select().single();
    if (error) { toast(error.message); return; }
    if (d.publications.length) {
      await supabase.from("publications").insert(d.publications.map(({ id, created_at, project_id, ...x }) => ({ ...x, project_id: data.id })));
    }
    await supabase.from("activity_log").insert({ project_id: data.id, actor_id: me, text: `started this project from a suggested direction in "${p.title}"` });
    await P.act(`started "${s.title}" as a new project`);
    toast("New project created. Run the idea check to score it, then invite your team.");
    go(`p/${data.id}/idea`);
  };

  if (!low && !open && !dir) {
    return (
      <section className="dirs collapsed">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h3>Related directions</h3><p className="muted" style={{ fontSize: ".88rem" }}>This idea scored {DIR_THRESHOLD} or above, so alternatives aren't suggested automatically.</p></div>
          <button className="btn small" type="button" onClick={() => setOpen(true)}>Explore related directions</button>
        </div>
      </section>
    );
  }

  const orcids = d.members.filter((m) => P.profiles[m.user_id]?.orcid).length;
  return (
    <section className={"dirs" + (low ? " low" : "")}>
      <div className="panel-head">
        <div>
          <h3>Related directions</h3>
          <p className="muted" style={{ fontSize: ".9rem" }}>
            {low ? `This idea scored below ${DIR_THRESHOLD}, so ResearchOS looked for directions that build on your team's own publications. ` : "Directions that build on your team's own publications. "}
            Each is ranked on fit, research and funding momentum (OpenAlex, NIH RePORTER), commercial pull (web search with sources), room to contribute and feasibility.
          </p>
        </div>
        {canEdit ? <div className="row"><button className={"btn small" + (dir ? "" : " primary")} type="button" disabled={isBusy("dirs")} onClick={suggest}>{dir ? "Suggest again" : "Suggest related directions"}</button></div> : null}
      </div>
      <Status k="dirs" text="Importing ORCID publications, checking paper and funding trends, and searching market signals… this can take a minute or two." />
      <p className="ms-sub">
        {orcids} of {d.members.length} member{d.members.length === 1 ? "" : "s"} added an ORCID iD · {d.publications.length} team publication{d.publications.length === 1 ? "" : "s"} on file. {" "}
        <button className="linkbtn" type="button" onClick={() => go(`p/${pid}/team`)}>Manage on the Team tab</button>
      </p>

      {!dir ? (
        <div className="empty"><p>{canEdit ? (low ? "Suggestions start automatically after a low score. If they didn't, run them here." : "No suggestions yet.") : "No suggestions yet. A Researcher or Lead can generate them."}</p></div>
      ) : (
        <>
          {dir.expertise_summary ? <div className="diag"><span className="label">What your publications show</span><p>{dir.expertise_summary}</p></div> : null}
          <p className="ms-sub">Suggested by {name(dir.run_by)} {ago(dir.created_at)} from {dir.based_on_count} publications.</p>
          <div className="dir-grid">
            {(dir.suggestions || []).map((s, k) => (
              <article className="dir" key={k}>
                <div className="dir-top"><span className="label">#{k + 1}</span><span className="dir-score"><strong>{clamp(s.overall)}</strong><span className="ms-sub">/100</span></span></div>
                <h3>{s.title}</h3>
                <p>{s.pitch}</p>
                <div className="subbars">
                  {SUBS.map(([key, label]) => (
                    <div className="subbar" key={key}><span>{label}</span><span className="track"><i style={{ width: clamp(s.scores?.[key]) + "%" }} /></span><b>{clamp(s.scores?.[key])}</b></div>
                  ))}
                </div>
                <Spark rows={s.trend} label="Papers per year" />
                <Spark rows={s.funding} label="NIH projects per year" />
                {(s.builds_on || []).length ? (
                  <div><span className="label">Builds on your work</span><ul className="clean" style={{ fontSize: ".86rem" }}>{s.builds_on.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                ) : <p className="ms-sub">Not tied to a specific team publication.</p>}
                <div><span className="label">Why</span><ul className="clean" style={{ fontSize: ".88rem" }}>{(s.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                {(s.signals || []).length ? (
                  <div><span className="label">Signals, with sources</span>
                    <ul className="clean sig">{s.signals.map((g, i) => (
                      <li key={i}>{g.claim}{g.number ? ` (${g.number})` : ""} {isUrl(g.source_url) ? <a href={g.source_url} target="_blank" rel="noopener">source ↗</a> : null}</li>
                    ))}</ul>
                  </div>
                ) : null}
                {s.first_experiment ? <p className="ev-rec"><span className="label">Cheapest first test</span><span>{s.first_experiment}</span></p> : null}
                {s.risk ? <p className="ms-sub">Risk: {s.risk}</p> : null}
                {canEdit ? <div><button className="btn small primary" type="button" onClick={(e) => { e.currentTarget.disabled = true; startFrom(s); }}>Start as a new project</button></div> : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

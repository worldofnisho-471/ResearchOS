import { useEffect, useState } from "react";
import { useP } from "../lib/project.jsx";
import { ai, supabase } from "../lib/supabase.js";
import { ago, assumptionsOf, evidenceCounts, isUrl, searchUrl, whereLabel } from "../lib/util.js";
import { useBusy } from "./ui.jsx";

const CUR = { INR: "₹", USD: "$", EUR: "€" };

function Assumption({ x }) {
  const P = useP();
  const { d, pid, canEdit, run, act, name, toast } = P;
  const e = d.evidence.find((v) => v.assumption_id === x.id) || {};
  const st = e.status || "Unchecked";
  const [link, setLink] = useState(e.link || "");
  const [note, setNote] = useState(e.note || "");
  useEffect(() => { setLink(e.link || ""); setNote(e.note || ""); }, [e.link, e.note]);

  const mark = async (status) => {
    if (status === "Unchecked") {
      if (await run(supabase.from("evidence").delete().eq("project_id", pid).eq("assumption_id", x.id), ["evidence"])) act(`cleared the evidence for "${x.claim}"`);
      return;
    }
    if (status === "Confirmed" && !link.trim() && !note.trim()) { toast("Add a link or a note with the evidence first."); return; }
    const ok = await run(supabase.from("evidence").upsert({ project_id: pid, assumption_id: x.id, status, link: link.trim(), note: note.trim(), recorded_by: P.me, updated_at: new Date().toISOString() }), ["evidence"]);
    if (ok) act(`marked the assumption "${x.claim}" as ${status.toLowerCase()}`);
  };

  return (
    <article className={"assume" + (st === "Confirmed" ? " ok" : st === "Rejected" ? " no" : "")}>
      <div className="assume-top">
        <span className="tag">{x.category || "Assumption"}</span>
        <span className="ms-sub">AI confidence: {x.confidence || "?"}</span>
        <span className={"pill " + (st === "Confirmed" ? "good" : st === "Rejected" ? "bad" : "none")}>{st === "Unchecked" ? "Not checked" : st}</span>
      </div>
      <strong>{x.claim}</strong>
      {x.basis ? <p className="muted" style={{ fontSize: ".85rem" }}>Basis: {x.basis}</p> : null}
      <p style={{ fontSize: ".85rem" }}>To check: {x.check || "find evidence for or against this"}{" "}
        <a href={searchUrl(x)} target="_blank" rel="noopener">Search {whereLabel(x.where)} ↗</a></p>
      {e.link || e.note ? (
        <p className="ev-rec">
          <span className="label">Evidence · {name(e.recorded_by)} · {ago(e.updated_at)}</span>
          {e.note ? <span>{e.note}</span> : null}
          {isUrl(e.link) ? <a href={e.link} target="_blank" rel="noopener">{e.link}</a> : e.link ? <span className="ms-sub">{e.link}</span> : null}
        </p>
      ) : null}
      {canEdit ? (
        <div className="ev-form">
          <input type="url" value={link} onChange={(ev) => setLink(ev.target.value)} placeholder="Link to the source (report, patent, paper, quote)" aria-label="Evidence link" />
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What it shows, e.g. 'Distributor quote: ₹45 per test'" aria-label="Evidence note" />
          <div className="row">
            <button className="btn small" type="button" onClick={() => mark("Confirmed")}>Mark confirmed</button>
            <button className="btn small" type="button" onClick={() => mark("Rejected")}>Mark rejected</button>
            {st !== "Unchecked" ? <button className="linkbtn" type="button" onClick={() => mark("Unchecked")}>Clear</button> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Econ() {
  const P = useP();
  const { d, pid, canEdit, run, act, name } = P;
  const e = d.econ || {};
  const [v, setV] = useState({ currency: e.currency || "INR", price: e.price ?? "", cost: e.cost ?? "", units: e.units ?? "" });
  useEffect(() => { if (d.econ) setV({ currency: d.econ.currency, price: d.econ.price, cost: d.econ.cost, units: d.econ.units }); }, [d.econ]);
  const sym = CUR[v.currency] || "₹";
  const price = Number(v.price) || 0, cost = Number(v.cost) || 0, units = Number(v.units) || 0;
  const fmt = (n) => (n < 0 ? "−" : "") + sym + Math.abs(Math.round(n)).toLocaleString(sym === "₹" ? "en-IN" : "en-US");
  const m = price - cost;
  const set = (k) => (ev) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const save = async (ev) => {
    ev.preventDefault();
    const ok = await run(supabase.from("econ").upsert({ project_id: pid, currency: v.currency, price, cost, units, updated_by: P.me, updated_at: new Date().toISOString() }), ["econ"], "Unit economics saved for the team.");
    if (ok) act("updated the unit economics");
  };
  const cell = (l, val, neg) => <div className={"econ-cell" + (neg ? " neg" : "")}><span className="label">{l}</span><strong>{val}</strong></div>;
  return (
    <div className="econ">
      <h3>Unit economics</h3>
      <p className="muted" style={{ fontSize: ".88rem" }}>{e.updated_at ? `Your team's own numbers, last saved by ${name(e.updated_by)} ${ago(e.updated_at)}. The re-score uses them.` : "Your team's own numbers, not the AI's. The re-score uses them once saved."}</p>
      <form className="econ-form" onSubmit={save}>
        <fieldset disabled={!canEdit} style={{ display: "contents" }}>
          <div className="field"><label className="label" htmlFor="ec-cur">Currency</label>
            <select id="ec-cur" value={v.currency} onChange={set("currency")}>{Object.keys(CUR).map((k) => <option key={k} value={k}>{CUR[k]} {k}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="ec-price">Price per unit</label><input id="ec-price" type="number" min="0" step="any" value={v.price} onChange={set("price")} /></div>
          <div className="field"><label className="label" htmlFor="ec-cost">Cost per unit</label><input id="ec-cost" type="number" min="0" step="any" value={v.cost} onChange={set("cost")} /></div>
          <div className="field"><label className="label" htmlFor="ec-units">Units per year</label><input id="ec-units" type="number" min="0" step="any" value={v.units} onChange={set("units")} /></div>
          {canEdit ? <div className="field" style={{ alignSelf: "end" }}><button className="btn small primary" type="submit">Save for the team</button></div> : null}
        </fieldset>
      </form>
      <div className="econ-out">
        {!price || !units ? <p className="ms-sub">Enter a price and yearly volume to see margin and revenue.</p> : (
          <>{cell("Margin per unit", fmt(m), m < 0)}{cell("Gross margin", `${Math.round((m / price) * 100)}%`, m < 0)}{cell("Revenue per year", fmt(price * units))}{cell("Gross profit per year", fmt(m * units), m < 0)}</>
        )}
      </div>
    </div>
  );
}

export default function Commercial() {
  const P = useP();
  const { d, pid, isLead, reload } = P;
  const a = d.project.assessment;
  const list = assumptionsOf(a);
  const c = evidenceCounts(a, d.evidence);
  const { isBusy, run, Status } = useBusy();
  const rescore = async () => {
    const out = await run("rescore", (pr) => ai("rescore", pid, {}, pr));
    if (out) await reload("project", "activity");
  };
  return (
    <section className="commercial">
      <div className="panel-head">
        <div>
          <h3>Commercial case</h3>
          <p className="muted" style={{ fontSize: ".9rem" }}>The commercial score is the AI's estimate. These are the assumptions behind it. Check each one, record what you find, and re-score once you have evidence.</p>
        </div>
        {list.length && isLead ? <div className="row"><button className="btn small" type="button" disabled={isBusy("rescore")} onClick={rescore}>Re-score with evidence</button></div> : null}
      </div>
      <Status k="rescore" text="Re-scoring with your evidence…" />
      {list.length ? (
        <div className="row">
          <span className={"pill " + (c.rej ? "bad" : c.conf === c.n ? "good" : "warn")}>Evidence-backed: {c.conf} of {c.n}</span>
          {c.rej ? <span className="ms-sub">{c.rej} rejected. {isLead ? "Re-score so the estimate reflects it." : "A Lead can re-score the estimate."}</span> : null}
        </div>
      ) : null}
      {list.length ? <div className="assumes">{list.map((x) => <Assumption key={x.id} x={x} />)}</div>
        : <div className="empty"><p>No assumptions were listed for this assessment. {isLead ? "Re-run the idea check to get them." : ""}</p></div>}
      {d.project.goal === "Product" ? <Econ /> : null}
    </section>
  );
}

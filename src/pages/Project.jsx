import { useEffect } from "react";
import { ProjectProvider, useP } from "../lib/project.jsx";
import { go } from "../lib/router.js";
import TopBar from "../components/TopBar.jsx";
import { Avatar } from "../components/ui.jsx";
import Idea from "../tabs/Idea.jsx";
import Plan from "../tabs/Plan.jsx";
import Results from "../tabs/Results.jsx";
import Dashboard from "../tabs/Dashboard.jsx";
import Next from "../tabs/Next.jsx";
import Notes from "../tabs/Notes.jsx";
import Team from "../tabs/Team.jsx";

const TABS = [
  ["idea", "1", "Idea check"], ["plan", "2", "Research plan"], ["results", "3", "Log results"],
  ["dash", "4", "Dashboard"], ["next", "5", "Next steps"], ["notes", "≡", "Notes"], ["team", "◎", "Team"],
];
const VIEWS = { idea: Idea, plan: Plan, results: Results, dash: Dashboard, next: Next, notes: Notes, team: Team };

export default function Project({ pid, tab, session }) {
  return (
    <ProjectProvider pid={pid} session={session} tab={tab}>
      <Shell session={session} tab={tab} />
    </ProjectProvider>
  );
}

function Shell({ session, tab }) {
  const P = useP();
  const { d, loaded, missing, online, role, name, pid } = P;

  useEffect(() => {
    if (loaded && !VIEWS[tab]) go(`p/${pid}/${d.tasks.length ? "dash" : "idea"}`);
  }, [loaded, tab, pid, d.tasks.length]);

  if (loaded && (missing || !role)) {
    return (
      <div className="wrap">
        <TopBar session={session} crumb title="Project not found" />
        <main className="panel"><div className="empty">
          <p>This project doesn't exist, or you're not a member. Ask its Lead for an invite.</p>
          <button className="btn" type="button" onClick={() => go("")}>Back to projects</button>
        </div></main>
      </div>
    );
  }

  const done = { idea: !!d.project?.assessment, plan: d.tasks.length > 0, results: d.results.length > 0, dash: false, next: !!P.review, notes: d.notes.length > 0, team: d.members.length > 1 };
  const here = online.filter((o) => o.id);
  const View = VIEWS[tab];

  return (
    <div className="wrap">
      <TopBar session={session} crumb title={loaded ? (d.project?.title || "Untitled project") : "Loading…"}>
        {here.length ? (
          <div className="people">
            <div className="avs">{here.slice(0, 5).map((o) => <Avatar key={o.id} id={o.id} name={name(o.id)} />)}</div>
            <span className="here"><span className="dot" />{here.length} here now</span>
          </div>
        ) : null}
        {role ? <span className="role">You: {role}</span> : null}
      </TopBar>
      {role === "Observer" ? <p className="ro">You're an Observer on this project. You can read everything and comment on tasks. A Lead can change your role on the Team tab.</p> : null}
      {d.project?.is_example ? <p className="notice">This is a worked example with sample data, so you can try every screen. Start your own project from the home page.</p> : null}
      <nav className="steps" role="tablist" aria-label="Project sections">
        {TABS.map(([k, n, label]) => (
          <button key={k} className={"step" + (done[k] ? " done" : "") + (k === "notes" ? " notes-tab" : "")} role="tab" type="button"
            aria-selected={tab === k ? "true" : "false"} onClick={() => go(`p/${pid}/${k}`)}>
            <span className="n">{n}</span>{label}
          </button>
        ))}
      </nav>
      <main className="panel" role="tabpanel">
        {!loaded || !View ? <p className="muted">Loading the project…</p> : <View />}
      </main>
    </div>
  );
}

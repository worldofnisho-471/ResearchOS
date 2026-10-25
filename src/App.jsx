import { useEffect, useState } from "react";
import { configured, supabase } from "./lib/supabase.js";
import { useRoute, go } from "./lib/router.js";
import { ToastProvider } from "./components/Toast.jsx";
import Auth from "./pages/Auth.jsx";
import Home from "./pages/Home.jsx";
import Invite from "./pages/Invite.jsx";
import Profile from "./pages/Profile.jsx";
import Project from "./pages/Project.jsx";

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}

function Shell() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="wrap"><main className="panel">
        <h1>ResearchOS isn't connected yet</h1>
        <p className="muted">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env.local</code>, or in Vercel's environment variables), then rebuild. The README has the steps.</p>
      </main></div>
    );
  }
  if (session === undefined) return <div className="loading">Loading…</div>;

  const [r0, r1, r2] = route;
  if (r0 === "invite" && r1) return <Invite token={r1} session={session} />;
  if (!session) return <Auth />;
  if (r0 === "p" && r1) return <Project key={r1} pid={r1} tab={r2 || ""} session={session} />;
  if (r0 === "profile") return <Profile session={session} />;
  if (r0 && r0 !== "") { go(""); return null; }
  return <Home session={session} />;
}

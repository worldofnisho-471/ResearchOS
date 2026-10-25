import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";
import { Avatar } from "./ui.jsx";

export function useMyProfile(session) {
  const [p, setP] = useState(null);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(({ data }) => setP(data));
  }, [session.user.id]);
  return p;
}

export default function TopBar({ session, crumb, title, children }) {
  const me = useMyProfile(session);
  const name = (me && me.display_name) || session.user.email;
  return (
    <header className="top">
      <div className="brand">
        <a className="mark" href="#/" aria-label="ResearchOS home">R</a>
        <div className="proj">
          <span className="label">{crumb ? <button className="crumb" type="button" onClick={() => go("")}>← All projects</button> : "ResearchOS"}</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="topbar-right">
        {children}
        <button className="menu-btn" type="button" onClick={() => go("profile")} title="Your profile and ORCID iD">
          <Avatar id={session.user.id} name={name} size="sm" /> {name}
        </button>
      </div>
    </header>
  );
}

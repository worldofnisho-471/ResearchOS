import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { go } from "../lib/router.js";

export function useMyProfile(session) {
  const [p, setP] = useState(null);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(({ data }) => setP(data));
  }, [session.user.id]);
  return p;
}

/** Page header: where you are, plus page-specific extras (who's here, your role). Account controls are in the AppBar. */
export default function TopBar({ crumb, title, children }) {
  return (
    <header className="top">
      <div className="brand">
        <div className="proj">
          <span className="label">{crumb ? <button className="crumb" type="button" onClick={() => go("")}>← All projects</button> : "ResearchOS"}</span>
          <h1>{title}</h1>
        </div>
      </div>
      {children ? <div className="topbar-right">{children}</div> : null}
    </header>
  );
}

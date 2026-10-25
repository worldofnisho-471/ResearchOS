import { useEffect, useState } from "react";

const read = () => (window.location.hash.replace(/^#\/?/, "").split("?")[0] || "").split("/").filter(Boolean).map(decodeURIComponent);

/** Tiny hash router: "#/p/<id>/plan" -> ["p", "<id>", "plan"]. Works on any static host with no rewrites. */
export function useRoute() {
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export const go = (path) => { window.location.hash = "#/" + path.replace(/^\//, ""); };

import { useSyncExternalStore } from "react";

// AI jobs and unsaved drafts live here, outside any tab, so switching tabs
// (or projects) never cancels a running job or loses its result or error.
const jobs = new Map();   // "projectId:key" -> { busy: true, at } | { error }
const drafts = new Map(); // "projectId:name" -> any
const subs = new Set();
let version = 0;
const emit = () => { version++; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export const getJob = (id) => jobs.get(id) || null;
export function setJobError(id, msg) { if (msg) jobs.set(id, { error: msg }); else jobs.delete(id); emit(); }

/** Starts fn unless the same job is already running. Resolves to fn's result, or null on error. */
export async function runJob(id, fn) {
  if (jobs.get(id)?.busy) return null;
  jobs.set(id, { busy: true, at: Date.now() }); emit();
  try {
    const out = await fn();
    jobs.delete(id); emit();
    return out;
  } catch (e) {
    jobs.set(id, { error: (e && e.message) || "Something went wrong. Try again." }); emit();
    return null;
  }
}

export const busyKeys = (prefix) => [...jobs.entries()].filter(([k, v]) => k.startsWith(prefix) && v.busy).map(([k]) => k.slice(prefix.length));
export const useJobsVersion = () => useSyncExternalStore(subscribe, () => version);

export const getDraft = (id) => drafts.get(id);
export const setDraft = (id, v) => { if (v === undefined) drafts.delete(id); else drafts.set(id, v); };

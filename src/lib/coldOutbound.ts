// Tom Reilly — special access for Cold Outbound workspace
export const JAMES_USER_ID = "42292222-46a0-4b2c-85b8-ecf3fca6415b";
export const JAMES_SETTER_PROFILE_ID = "cef1ff48-352d-4dbf-8db2-d3f537778b3c";
export const JAMES_WORKSPACE_KEY = "james_workspace_mode";
export type JamesWorkspaceMode = "setter" | "cold_outbound";

export const getJamesMode = (): JamesWorkspaceMode => {
  if (typeof window === "undefined") return "setter";
  return (localStorage.getItem(JAMES_WORKSPACE_KEY) as JamesWorkspaceMode) || "setter";
};

export const setJamesMode = (mode: JamesWorkspaceMode) => {
  localStorage.setItem(JAMES_WORKSPACE_KEY, mode);
};

export const smartleadSentiment = (s?: string | null) => {
  switch ((s || "").toLowerCase()) {
    case "positive": return { dot: "🟢", label: "Positive", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
    case "interested": return { dot: "🟡", label: "Interested", color: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    case "more_info": return { dot: "🔵", label: "More Info", color: "bg-blue-500/15 text-blue-600 border-blue-500/30" };
    case "not_interested": return { dot: "🔴", label: "Not Interested", color: "bg-red-500/15 text-red-600 border-red-500/30" };
    case "ooo": return { dot: "⚪", label: "OOO", color: "bg-muted text-muted-foreground border-border" };
    default: return { dot: "⚪", label: s || "Unclassified", color: "bg-muted text-muted-foreground border-border" };
  }
};

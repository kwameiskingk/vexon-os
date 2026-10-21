// Enquire navigation (15 Oct 2026). The three Enquire screens (list, builder,
// responses) are pages at /admin/forms/* AND live inside the Dev Centre
// (the owner's ruling: the builder is in the Dev Centre, never a reroute to
// Operations). Inside the Dev Centre a provider swaps route changes for
// state changes; on the pages the hook falls back to the router.

import { createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";

export type EnquireView =
  | { view: "list" }
  | { view: "editor"; id: string }
  | { view: "responses"; id: string; open?: string | null };

export const EnquireEmbedContext = createContext<((v: EnquireView) => void) | null>(null);

export function useEnquireEmbedded() {
  return useContext(EnquireEmbedContext) !== null;
}

export function useEnquireNav() {
  const embedded = useContext(EnquireEmbedContext);
  const nav = useNavigate();
  return (v: EnquireView) => {
    if (embedded) return embedded(v);
    if (v.view === "list") nav("/admin/forms");
    else if (v.view === "editor") nav(`/admin/forms/${v.id}`);
    else nav(`/admin/forms/${v.id}/responses${v.open ? `?open=${encodeURIComponent(v.open)}` : ""}`);
  };
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Building2, CalendarX2, ChevronRight, AlertTriangle } from "lucide-react";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";

/**
 * Fulfilment booking hub — /bookings/fulfilment. The ONE bookmark every
 * fulfilment setter needs. Since 8 Oct (the owner) it lists EVERY active client,
 * so a setter can book for whichever client the prospect belongs to: today's
 * rostered client(s) sit at the top marked "Your client today", and picking
 * any other one asks "This is not the client you are assigned to. Proceed
 * anyway?" first. Clients that can't take bookings yet stay visible, greyed,
 * with the reason (not set up, calendar not connected, paused).
 */

const C = {
  ink: "#111113", soft: "#5f5f66", faint: "#8e8e96", line: "#e3e3e6",
  purple: "#4a5d73", deep: "#3d5a80",
  grad: "linear-gradient(135deg,#8c8c8c,#5a5a5a,#3d5a80)",
};

type HubClient = {
  id: string; name: string; logo: string | null;
  event_slug: string | null; accepting: boolean;
  calendar_connected: boolean; rostered: boolean;
};

const isReady = (c: HubClient) => !!c.event_slug && c.accepting && c.calendar_connected;

const statusLine = (c: HubClient) =>
  !c.event_slug
    ? "Not set up on Kronos yet"
    : !c.calendar_connected
    ? "Calendar not connected"
    : !c.accepting
    ? "Bookings paused for this client"
    : "Book a meeting";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{
        colorScheme: "light",
        background:
          "radial-gradient(900px 500px at 15% -5%, #ededf0 0%, transparent 60%)," +
          "radial-gradient(800px 480px at 90% 0%, #e8ecf1 0%, transparent 55%), #f7f7f8",
      }}
    >
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <img src={bookingsLogo} alt="Vexon OS" className="w-9 h-9 rounded-xl shadow-sm" />
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: C.ink }}>
            VEXON <span className="rr-gradient-text">BOOKINGS</span>
          </span>
        </div>
        {children}
        <p className="text-center text-[11px] mt-6" style={{ color: C.faint }}>
          Powered by <span className="font-semibold" style={{ color: C.soft }}>Vexon OS Bookings</span>
        </p>
      </div>
    </div>
  );
}

export default function FulfilmentHubPage() {
  const navigate = useNavigate();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  // The client a setter picked that isn't on their roster today, awaiting
  // "Proceed anyway".
  const [offRoster, setOffRoster] = useState<HubClient | null>(null);
  useEffect(() => {
    if (!offRoster) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOffRoster(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offRoster]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsStaff(!!data.session?.user));
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fulfilment-hub-context"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("booking-public", {
        body: { action: "fulfilment_context" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { is_admin: boolean; clients: HubClient[] };
    },
    enabled: isStaff === true,
    retry: 1,
  });

  const card = (content: React.ReactNode) => (
    <div className="bg-white rounded-3xl p-8" style={{ border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(154,86,208,.12)" }}>
      {content}
    </div>
  );

  if (isStaff === false) {
    return (
      <Shell>{card(
        <div className="text-center space-y-2">
          <Building2 className="h-6 w-6 mx-auto" style={{ color: C.purple }} />
          <p className="font-semibold" style={{ color: C.ink }}>Sign in to Vexon OS first</p>
          <p className="text-sm" style={{ color: C.soft }}>
            Open Vexon OS in another tab of this browser, sign in, then refresh this page.
          </p>
        </div>
      )}</Shell>
    );
  }
  if (isStaff === null || isLoading) {
    return (
      <Shell>{card(
        <div className="flex items-center gap-2 justify-center py-8 text-sm" style={{ color: C.soft }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.purple }} /> Loading your clients…
        </div>
      )}</Shell>
    );
  }
  if (error) {
    return (
      <Shell>{card(
        <div className="text-center space-y-2">
          <CalendarX2 className="h-6 w-6 mx-auto" style={{ color: "#9e9e9e" }} />
          <p className="font-semibold" style={{ color: C.ink }}>Couldn't load your clients</p>
          <p className="text-sm" style={{ color: C.soft }}>{(error as Error).message}</p>
        </div>
      )}</Shell>
    );
  }

  const clients = data?.clients || [];
  if (clients.length === 0) {
    return (
      <Shell>{card(
        <div className="text-center space-y-2">
          <Building2 className="h-6 w-6 mx-auto" style={{ color: C.faint }} />
          <p className="font-semibold" style={{ color: C.ink }}>No active clients yet</p>
        </div>
      )}</Shell>
    );
  }
  // Their own client(s) first, then the ones taking bookings, then the rest.
  const ordered = [...clients].sort((a, b) =>
    Number(b.rostered) - Number(a.rostered) ||
    Number(isReady(b)) - Number(isReady(a)) ||
    a.name.localeCompare(b.name));
  const hasRoster = clients.some((c) => c.rostered);

  const open = (c: HubClient) => {
    if (!isReady(c) || !c.event_slug) return;
    // Admin tier isn't rostered on anyone, so the warning is for setters only.
    if (!data?.is_admin && !c.rostered) { setOffRoster(c); return; }
    navigate(`/bookings/${c.event_slug}`);
  };

  return (
    <Shell>
      {card(
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: C.ink }}>Who are you booking for?</h1>
            <p className="text-sm mt-0.5" style={{ color: C.soft }}>
              Pick the client the prospect is for, not just the client you're assigned to.
              {!data?.is_admin && !hasRoster && " You're not on the roster for a client today."}
            </p>
          </div>
          <div className="space-y-2">
            {ordered.map((c) => {
              const ready = isReady(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!ready}
                  onClick={() => open(c)}
                  className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    border: `1.5px solid ${c.rostered ? C.purple : C.line}`,
                    background: ready ? "#fff" : "#f6f5f9",
                  }}
                >
                  {c.logo ? (
                    <img src={c.logo} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#efeff1" }}>
                      <Building2 className="h-5 w-5" style={{ color: C.purple }} />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm truncate" style={{ color: C.ink }}>{c.name}</span>
                      {c.rostered && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: "#efeff1", color: C.deep }}>
                          Your client today
                        </span>
                      )}
                    </span>
                    <span className="block text-xs" style={{ color: C.soft }}>{statusLine(c)}</span>
                  </span>
                  {ready && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.faint }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {offRoster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(30,27,46,.45)" }}
          onClick={() => setOffRoster(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="off-roster-title"
            className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4"
            style={{ border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(30,27,46,.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#b45309" }} />
              <div className="space-y-1">
                <p id="off-roster-title" className="font-semibold" style={{ color: C.ink }}>
                  This is not the client you are assigned to
                </p>
                <p className="text-sm" style={{ color: C.soft }}>
                  You're about to book for <b style={{ color: C.ink }}>{offRoster.name}</b>. Make sure
                  the prospect is for this client. Proceed anyway?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setOffRoster(null)}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{ border: `1.5px solid ${C.line}`, color: C.soft, background: "#fff" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => offRoster.event_slug && navigate(`/bookings/${offRoster.event_slug}`)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: C.grad }}
              >
                Proceed anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

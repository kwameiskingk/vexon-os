import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarCheck, CheckCircle2, CalendarX2, ShieldCheck } from "lucide-react";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";

/**
 * Client calendar connection — /connect-calendar. Clients land here from the
 * branded connect email; the one-off token travels in the URL fragment
 * (#ct=…), never in server logs. One Google button (Microsoft joins once the
 * client mix is known); the OAuth callback bounces back here with #done=1 or
 * #error=…
 */

const C = {
  ink: "#111113", soft: "#5f5f66", faint: "#8e8e96", line: "#e3e3e6",
  purple: "#4a5d73", deep: "#3d5a80",
  grad: "linear-gradient(135deg,#8c8c8c,#5a5a5a,#3d5a80)",
};

function parseFragment() {
  const raw = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return {
    ct: params.get("ct") || "",
    done: params.get("done") === "1",
    error: params.get("error") || "",
    adminDone: params.get("admin_done") === "1",
  };
}

export default function ConnectCalendarPage() {
  const frag = useMemo(parseFragment, []);
  const [launching, setLaunching] = useState(false);

  // The token stays out of the address bar after load (same pattern as /welcome).
  useEffect(() => {
    if (frag.ct) history.replaceState(null, "", window.location.pathname);
  }, [frag.ct]);

  const { data: ctx, isLoading, error: ctxError } = useQuery({
    queryKey: ["connect-calendar-context"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("booking-client-connect", {
        body: { action: "context", ct: frag.ct },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        client_name: string; already_connected: boolean;
        google_ready: boolean; microsoft_ready: boolean;
      };
    },
    enabled: !!frag.ct && !frag.done,
    retry: 1,
  });

  const startProvider = async (action: "google_url" | "microsoft_url") => {
    setLaunching(true);
    const { data, error } = await supabase.functions.invoke("booking-client-connect", {
      body: { action, ct: frag.ct },
    });
    const failMsg = error?.message || data?.error;
    if (failMsg || !data?.url) {
      setLaunching(false);
      alert(failMsg || "Couldn't start the connection — try again.");
      return;
    }
    window.location.href = data.url;
  };
  const startGoogle = () => startProvider("google_url");
  const startMicrosoft = () => startProvider("microsoft_url");

  // "Your IT admin needs to approve first" — fetch the tenant-wide consent
  // URL the client forwards to IT.
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const [adminCopied, setAdminCopied] = useState(false);
  const needsAdminConsent = frag.error === "admin_consent_needed" && !!frag.ct;
  useEffect(() => {
    if (!needsAdminConsent) return;
    supabase.functions
      .invoke("booking-client-connect", { body: { action: "microsoft_admin_url", ct: frag.ct } })
      .then(({ data }) => {
        if (data?.url) setAdminUrl(data.url);
      });
  }, [needsAdminConsent, frag.ct]);

  const card = (content: React.ReactNode) => (
    <div
      className="min-h-screen px-4 py-10 flex items-start justify-center"
      style={{
        colorScheme: "light",
        background:
          "radial-gradient(900px 500px at 15% -5%, #ededf0 0%, transparent 60%)," +
          "radial-gradient(800px 480px at 90% 0%, #e8ecf1 0%, transparent 55%), #f7f7f8",
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <img src={bookingsLogo} alt="Vexon OS" className="w-9 h-9 rounded-xl shadow-sm" />
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: C.ink }}>
            VEXON <span className="rr-gradient-text">BOOKINGS</span>
          </span>
        </div>
        <div className="bg-white rounded-3xl p-8" style={{ border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(154,86,208,.12)" }}>
          {content}
        </div>
      </div>
    </div>
  );

  if (frag.done) {
    return card(
      <div className="text-center space-y-3">
        <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: "#059669" }} />
        <h1 className="text-xl font-bold" style={{ color: C.ink }}>Calendar connected ✓</h1>
        <p className="text-sm" style={{ color: C.soft }}>
          That's everything. Meetings we book will now land straight in your calendar,
          and we'll only ever offer times you're genuinely free. You can close this page.
        </p>
      </div>
    );
  }
  if (frag.adminDone) {
    return card(
      <div className="text-center space-y-3">
        <ShieldCheck className="h-10 w-10 mx-auto" style={{ color: "#059669" }} />
        <h1 className="text-xl font-bold" style={{ color: C.ink }}>IT approval received ✓</h1>
        <p className="text-sm" style={{ color: C.soft }}>
          Your IT admin has approved Vexon OS Bookings for your organisation.
          One step left — connect your own calendar:
        </p>
        <button
          type="button"
          disabled={launching || !frag.ct}
          onClick={startMicrosoft}
          className="w-full rounded-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: C.grad, boxShadow: "0 10px 30px rgba(154,86,208,.28)" }}
        >
          {launching ? "Opening Microsoft…" : "Connect with Microsoft"}
        </button>
        {!frag.ct && (
          <p className="text-xs" style={{ color: C.faint }}>
            Open the connect link from your email to finish.
          </p>
        )}
      </div>
    );
  }
  if (needsAdminConsent) {
    return card(
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <ShieldCheck className="h-8 w-8 mx-auto" style={{ color: C.purple }} />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>
            One quick approval from your IT admin
          </h1>
          <p className="text-sm" style={{ color: C.soft }}>
            Your organisation's Microsoft settings need an IT admin to approve
            calendar access before you can connect — a one-time, one-click
            approval for the whole company.
          </p>
        </div>
        <div className="rounded-2xl p-4 text-sm" style={{ background: "#f7f7f8", border: `1px solid ${C.line}`, color: C.soft }}>
          <p className="font-semibold mb-1" style={{ color: C.ink }}>Send this link to your IT admin:</p>
          <p className="break-all text-xs" style={{ color: C.purple }}>{adminUrl || "Preparing the link…"}</p>
        </div>
        <button
          type="button"
          disabled={!adminUrl}
          onClick={async () => {
            if (!adminUrl) return;
            try {
              await navigator.clipboard.writeText(adminUrl);
              setAdminCopied(true);
              setTimeout(() => setAdminCopied(false), 2500);
            } catch { /* clipboard blocked — the URL is visible to copy by hand */ }
          }}
          className="w-full rounded-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: C.grad, boxShadow: "0 10px 30px rgba(154,86,208,.28)" }}
        >
          {adminCopied ? "Copied ✓" : "Copy the approval link"}
        </button>
        <p className="text-xs text-center" style={{ color: C.faint }}>
          Once they've approved, open your connect email again and hit
          Connect with Microsoft — it'll go straight through.
        </p>
      </div>
    );
  }
  if (frag.error) {
    return card(
      <div className="text-center space-y-3">
        <CalendarX2 className="h-8 w-8 mx-auto" style={{ color: "#9e9e9e" }} />
        <h1 className="text-lg font-bold" style={{ color: C.ink }}>That didn't go through</h1>
        <p className="text-sm" style={{ color: C.soft }}>{frag.error}</p>
        <p className="text-xs" style={{ color: C.faint }}>
          Use the button in your email to try again, or reply to your account manager for a fresh link.
        </p>
      </div>
    );
  }
  if (!frag.ct) {
    return card(
      <div className="text-center space-y-3">
        <CalendarX2 className="h-8 w-8 mx-auto" style={{ color: C.faint }} />
        <h1 className="text-lg font-bold" style={{ color: C.ink }}>This link is incomplete</h1>
        <p className="text-sm" style={{ color: C.soft }}>
          Open the connect link from your email again — or ask your account manager to resend it.
        </p>
      </div>
    );
  }
  if (isLoading) {
    return card(
      <div className="flex items-center gap-2 justify-center py-8 text-sm" style={{ color: C.soft }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.purple }} /> One moment…
      </div>
    );
  }
  if (ctxError) {
    return card(
      <div className="text-center space-y-3">
        <CalendarX2 className="h-8 w-8 mx-auto" style={{ color: "#9e9e9e" }} />
        <h1 className="text-lg font-bold" style={{ color: C.ink }}>Link expired</h1>
        <p className="text-sm" style={{ color: C.soft }}>{(ctxError as Error).message}</p>
      </div>
    );
  }
  if (ctx?.already_connected) {
    return card(
      <div className="text-center space-y-3">
        <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: "#059669" }} />
        <h1 className="text-xl font-bold" style={{ color: C.ink }}>Already connected ✓</h1>
        <p className="text-sm" style={{ color: C.soft }}>Your calendar is linked — nothing more to do.</p>
      </div>
    );
  }

  return card(
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <CalendarCheck className="h-8 w-8 mx-auto" style={{ color: C.purple }} />
        <h1 className="text-xl font-bold" style={{ color: C.ink }}>
          Connect {ctx?.client_name}'s calendar
        </h1>
        <p className="text-sm" style={{ color: C.soft }}>
          One click, under a minute. Meetings we book land straight in your calendar,
          and we only offer times you're genuinely free.
        </p>
      </div>
      <button
        type="button"
        disabled={!ctx?.google_ready || launching}
        onClick={startGoogle}
        className="w-full rounded-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
        style={{ background: C.grad, boxShadow: "0 10px 30px rgba(154,86,208,.28)" }}
      >
        {launching ? "Opening Google…" : "Connect with Google"}
      </button>
      {!ctx?.google_ready && (
        <p className="text-xs text-center" style={{ color: C.faint }}>
          Google connection is being switched on — try again shortly or reply to your account manager.
        </p>
      )}
      <button
        type="button"
        disabled={!ctx?.microsoft_ready || launching}
        onClick={startMicrosoft}
        className="w-full rounded-full py-3 font-semibold transition-opacity disabled:opacity-50"
        style={{ border: `1.5px solid ${C.line}`, color: C.ink, background: "#fff" }}
      >
        {ctx?.microsoft_ready
          ? (launching ? "Opening Microsoft…" : "Connect with Microsoft (Outlook + Teams)")
          : "Connect with Microsoft — coming soon"}
      </button>
      <p className="flex items-start gap-2 text-xs" style={{ color: C.faint }}>
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: C.purple }} />
        We can only see when you're busy and add the meetings we book for you — we can
        never read your emails or the details of your other events.
      </p>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, CalendarX2 } from "lucide-react";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";

/**
 * /bookings/confirm/<booking_id> — where the branded email's
 * "Confirm attendance ✓" button lands. Stamps the booking as
 * prospect-confirmed (and the linked meeting as client-accepted) so setters
 * can watch the confirmation come in live on the call. Idempotent.
 */

export default function BookingConfirmPage() {
  useEffect(() => { const prev = document.title; document.title = "Booked · Kronos by Meridian"; return () => { document.title = prev; }; }, []);
  const { bookingId } = useParams<{ bookingId: string }>();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [details, setDetails] = useState<{
    event_name: string; starts_at: string; host_name: string | null; prospect_name: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("booking-public", {
        body: { action: "confirm", booking_id: bookingId },
      });
      if (cancelled) return;
      if (error || data?.error) { setState("error"); return; }
      setDetails(data);
      setState("done");
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  const whenLocal = details
    ? new Date(details.starts_at).toLocaleString("en-GB", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div
      className="min-h-screen px-4 py-10 flex flex-col items-center"
      style={{
        colorScheme: "light",
        background:
          "radial-gradient(900px 500px at 15% -5%, #ededf0 0%, transparent 60%)," +
          "radial-gradient(800px 480px at 90% 0%, #e8ecf1 0%, transparent 55%), #f7f7f8",
      }}
    >
      <div className="flex items-center gap-2.5 mb-8">
        <img src={bookingsLogo} alt="Vexon OS" className="w-9 h-9 rounded-xl shadow-sm" />
        <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: "#111113" }}>
          KRONOS <span className="rr-gradient-text">BY VEXON</span>
        </span>
      </div>
      <div
        className="bg-white rounded-3xl p-10 text-center space-y-3 max-w-lg w-full"
        style={{ border: "1px solid #e3e3e6", boxShadow: "0 20px 60px rgba(154,86,208,.14)" }}
      >
        {state === "working" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "#4a5d73" }} />
            <p style={{ color: "#5f5f66" }}>Confirming your attendance…</p>
          </>
        )}
        {state === "done" && details && (
          <>
            <CheckCircle2 className="h-11 w-11 mx-auto" style={{ color: "#059669" }} />
            <h1 className="text-2xl font-bold" style={{ color: "#111113" }}>Attendance confirmed!</h1>
            <p style={{ color: "#5f5f66" }}>
              {details.prospect_name ? `Thanks, ${details.prospect_name.trim()}. ` : ""}
              Your <strong>{details.event_name}</strong>
              {details.host_name ? <> with <strong>{details.host_name}</strong></> : null} is locked in:
            </p>
            <p className="font-semibold text-lg" style={{ color: "#3d5a80" }}>{whenLocal} (UK time)</p>
            <p className="text-sm" style={{ color: "#5f5f66" }}>
              The Google Meet link is in your calendar invite and confirmation email. See you there!
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <CalendarX2 className="h-8 w-8 mx-auto" style={{ color: "#9e9e9e" }} />
            <p className="font-semibold" style={{ color: "#111113" }}>We couldn't find this booking</p>
            <p className="text-sm" style={{ color: "#5f5f66" }}>
              The link may be out of date — reply to your confirmation email and we'll sort it.
            </p>
          </>
        )}
      </div>
      <p className="text-center text-[11px] mt-6" style={{ color: "#8e8e96" }}>
        Powered by <span className="font-semibold" style={{ color: "#5f5f66" }}>Vexon OS</span>
      </p>
    </div>
  );
}

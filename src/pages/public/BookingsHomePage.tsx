import { useEffect } from "react";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";
import { LEGAL_LINE } from "@/lib/legalEntity";

/**
 * Public product page — /bookings. Exists for Google's OAuth branding
 * verification (the "Application home page" must be public, must not sit
 * behind a login, and must carry the app name "Vexon OS Bookings") and as an
 * honest explainer for clients deciding whether to connect their calendar.
 */

const C = {
  ink: "#111113", soft: "#5f5f66", faint: "#8e8e96", line: "#e3e3e6",
  purple: "#4a5d73", deep: "#3d5a80",
  grad: "linear-gradient(135deg,#8c8c8c,#5a5a5a,#3d5a80)",
  brand: "linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%)",
};

export default function BookingsHomePage() {
  useEffect(() => { const prev = document.title; document.title = "Kronos by Meridian"; return () => { document.title = prev; }; }, []);
  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{
        colorScheme: "light",
        background:
          "radial-gradient(900px 500px at 15% -5%, #ededf0 0%, transparent 60%)," +
          "radial-gradient(800px 480px at 90% 0%, #e8ecf1 0%, transparent 55%), #f7f7f8",
      }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5 mb-8">
          <img src={bookingsLogo} alt="Kronos by Meridian" className="w-9 h-9 rounded-xl shadow-sm" />
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: C.ink }}>
            KRONOS <span className="rr-gradient-text">BY VEXON</span>
          </span>
        </div>

        <div className="rounded-3xl p-8 md:p-10" style={{ background: C.brand, color: "#0f0f11" }}>
          <h1 className="text-3xl font-extrabold leading-tight" style={{ color: "#0f0f11" }}>Kronos</h1>
          <p className="mt-3 opacity-85 max-w-lg">
            The meeting-scheduling platform of Meridian. Our team books
            discovery calls, interviews, and client meetings — invites, reminders,
            and calendars handled automatically.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-8 md:p-10 mt-4" style={{ border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(154,86,208,.12)" }}>
          <h2 className="text-lg font-bold" style={{ color: C.ink }}>What it does</h2>
          <ul className="mt-3 space-y-2.5 text-[14.5px]" style={{ color: C.soft }}>
            <li>📅 <strong style={{ color: C.ink }}>Real availability</strong> — meeting times are offered only when the host is genuinely free.</li>
            <li>✉️ <strong style={{ color: C.ink }}>Automatic invitations</strong> — Google Calendar invites with a Meet link, plus email and SMS reminders.</li>
            <li>🤝 <strong style={{ color: C.ink }}>Client calendars</strong> — clients of Meridian can connect their Google calendar so meetings we book for them land directly in it, using only two narrow permissions: free/busy and the events we create. We can never read other events or email.</li>
          </ul>

          <h2 className="text-lg font-bold mt-8" style={{ color: C.ink }}>Connecting your calendar</h2>
          <p className="mt-2 text-[14.5px]" style={{ color: C.soft }}>
            If you're a Meridian client, your account manager sends you a
            personal connect link by email. One click, one Google permission screen,
            under a minute — and you can disconnect at any time from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: C.purple }}>
              Google account permissions
            </a>{" "}
            or by asking your account manager.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-8 pt-5" style={{ borderTop: `1px solid ${C.line}` }}>
            <a href="/privacy" className="text-sm font-semibold" style={{ color: C.purple }}>Privacy policy</a>
            <a href="mailto:team@meridiansales.example" className="text-sm font-semibold" style={{ color: C.purple }}>Contact us</a>
            <span className="text-xs" style={{ color: C.faint }}>{LEGAL_LINE}</span>
          </div>
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: C.faint }}>
          Kronos by Meridian. Powered by <span className="font-semibold" style={{ color: C.soft }}>Vexon OS</span>
        </p>
      </div>
    </div>
  );
}

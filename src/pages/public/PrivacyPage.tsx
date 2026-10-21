import bookingsLogo from "@/assets/vexon-mark-tile.svg";
import { LEGAL_ENTITY, LEGAL_LINE } from "@/lib/legalEntity";

/**
 * Public privacy policy — /privacy. Written for Vexon OS Bookings' Google
 * OAuth verification (the consent screen's "privacy policy link") and for
 * clients/prospects who want to know what we do with their data. Plain
 * English on purpose.
 */

const C = {
  ink: "#111113", soft: "#5f5f66", faint: "#8e8e96", line: "#e3e3e6",
  purple: "#4a5d73", deep: "#3d5a80",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-bold mb-2" style={{ color: C.deep }}>{title}</h2>
      <div className="space-y-2 text-[14px] leading-relaxed" style={{ color: C.soft }}>{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
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
        <div className="flex items-center gap-2.5 mb-6">
          <img src={bookingsLogo} alt="Vexon OS" className="w-9 h-9 rounded-xl shadow-sm" />
          <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: C.ink }}>
            VEXON <span className="rr-gradient-text">VEXON OS</span>
          </span>
        </div>
        <div className="bg-white rounded-3xl p-8 md:p-10" style={{ border: `1px solid ${C.line}`, boxShadow: "0 20px 60px rgba(154,86,208,.12)" }}>
          <h1 className="text-2xl font-bold" style={{ color: C.ink }}>Privacy Policy</h1>
          <p className="text-xs mt-1" style={{ color: C.faint }}>Vexon OS &amp; Vexon OS Bookings · Last updated 15 September 2026</p>
          <p className="text-xs mt-1" style={{ color: C.faint }}>{LEGAL_LINE}</p>

          <Section title="Who we are">
            <p>
              Vexon OS is the operations platform of {LEGAL_ENTITY.name} ("we", "us"). Vexon OS
              Bookings is the part of it that schedules meetings between our team, our clients,
              and the people our clients want to meet. {LEGAL_ENTITY.name} is the successor entity
              to Meridian Sales Partners Ltd; existing consents and data-processing arrangements
              continue under {LEGAL_ENTITY.name}. Questions about this policy:{" "}
              <a href="mailto:team@meridiansales.example" style={{ color: C.purple }}>team@meridiansales.example</a>.
            </p>
          </Section>

          <Section title="What we collect and why">
            <p><strong style={{ color: C.ink }}>If a meeting is booked with you:</strong> your name, work email,
            phone number, company, and your answers to the booking questions. We use these solely
            to arrange, confirm, and remind you about that meeting (calendar invitation, email,
            and SMS reminders) and to keep an internal record of it.</p>
            <p><strong style={{ color: C.ink }}>If you are a client who connects a calendar:</strong> see the
            Google section below — it is deliberately narrow.</p>
          </Section>

          <Section title="Google user data (connected client calendars)">
            <p>
              When a client chooses to connect their Google calendar to Vexon OS Bookings, we
              request only two calendar permissions:
            </p>
            <p>
              · <strong style={{ color: C.ink }}>Free/busy</strong> — so we only offer meeting times when the
              calendar is genuinely free.<br />
              · <strong style={{ color: C.ink }}>Events we create</strong> — so the meetings we book on the
              client's behalf appear in their calendar, and can be updated or cancelled by us.
            </p>
            <p>
              We can NOT read the titles, contents, attendees, or details of any other events,
              and we can never read email. We store the connection token securely and use it
              only for the two purposes above. Vexon OS's use of information received from
              Google APIs adheres to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank" rel="noopener noreferrer" style={{ color: C.purple }}>
                Google API Services User Data Policy
              </a>, including its Limited Use requirements. We do not sell Google user data, do
              not use it for advertising, and do not transfer it to third parties except the
              service providers below acting on our instructions.
            </p>
            <p>
              A client can disconnect at any time — by asking their account manager, or directly
              at{" "}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer"
                style={{ color: C.purple }}>myaccount.google.com/permissions</a>. Disconnecting
              immediately stops our access, and we delete the stored connection token.
            </p>
          </Section>

          <Section title="How we protect your data">
            <p>
              All data — including Google user data and calendar connection tokens — is protected
              by the following mechanisms:
            </p>
            <p>
              · <strong style={{ color: C.ink }}>Encryption in transit</strong> — every connection to Vexon OS
              and between Vexon OS and Google's APIs uses HTTPS/TLS. We never transmit Google user
              data over unencrypted channels.<br />
              · <strong style={{ color: C.ink }}>Encryption at rest</strong> — our database and backups are
              encrypted at rest (AES-256) on SOC 2 Type II certified infrastructure. OAuth
              access and refresh tokens are stored in this encrypted database, never in client-side
              code, logs, or files.<br />
              · <strong style={{ color: C.ink }}>Access controls</strong> — Google user data is accessed only by
              automated backend processes that schedule meetings. Database access is governed by
              row-level security and role-based permissions on a least-privilege basis; connection
              tokens are readable only by server-side service processes, never by end users or
              browser sessions. Staff access to production systems is limited to named
              administrators using individually authenticated accounts.<br />
              · <strong style={{ color: C.ink }}>Secret management</strong> — API credentials and signing keys are
              held in a managed secret store, not in source code, and are rotated when personnel
              or systems change.<br />
              · <strong style={{ color: C.ink }}>Monitoring and incident response</strong> — access is logged and
              monitored. If we become aware of a breach affecting your personal data, we will
              notify affected users and the relevant supervisory authority without undue delay,
              in line with UK GDPR requirements, and revoke or rotate any affected credentials.<br />
              · <strong style={{ color: C.ink }}>Deletion</strong> — when a client disconnects their calendar, the
              stored tokens are deleted immediately. Personal data is deleted on request, and
              data no longer needed for the purposes above is removed as part of routine reviews.
            </p>
            <p>
              We never use Google user data to train artificial-intelligence or machine-learning
              models, whether generalised or personalised.
            </p>
          </Section>

          <Section title="Who processes data for us">
            <p>
              We use a small set of service providers to run the platform: Supabase (database and
              hosting), Google (calendar invitations), Twilio (SMS reminders), and Resend
              (emails). Each processes data only to deliver the function described above.
            </p>
          </Section>

          <Section title="How long we keep things">
            <p>
              Meeting records are kept as part of our business records for as long as we work
              with the relevant client. Calendar connection tokens are deleted on disconnection.
              You can ask us to correct or delete your personal information at any time.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              You can ask what we hold about you, ask for corrections, or ask for deletion by
              emailing{" "}
              <a href="mailto:team@meridiansales.example" style={{ color: C.purple }}>team@meridiansales.example</a>.
              If you're in the UK or EU, you also have the right to complain to your data
              protection authority.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If this policy changes materially, we'll update this page and the date at the top.
            </p>
          </Section>
        </div>
        <p className="text-center text-[11px] mt-6" style={{ color: C.faint }}>
          Powered by <span className="font-semibold" style={{ color: C.soft }}>Vexon OS</span>
        </p>
      </div>
    </div>
  );
}

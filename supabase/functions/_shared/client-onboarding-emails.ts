// Branded email templates for the client onboarding flow. Sender identity is
// whatever RESEND_FROM resolves to in _shared/booking-flow.ts (currently
// "Meridian <bookings@send.meridiansales.example>") — change the env var, not this file.
//
// 3 Sep: rebuilt for every mail client. Marcus's Outlook showed white text on
// a white box because the old shell painted the banner and the button with a
// CSS gradient and nothing underneath it; Outlook drops gradients. Now every
// coloured surface is a table cell with a solid brand `bgcolor` first and the
// gradient layered on top as a bonus for clients that render it (Gmail, Apple
// Mail). Same look where it was already working, readable everywhere else.
// The button is the "bulletproof" VML + anchor pattern so Outlook desktop
// draws it too. No em dashes in copy (the owner). Rocket stays (the owner).

import { LEGAL_LINE } from "./legalEntity.ts";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FONT = "Arial, Helvetica, 'Segoe UI', sans-serif";

function shell(headline: string, inner: string, preheader = "") {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(headline)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td{font-family:Arial,Helvetica,sans-serif !important;} .banner,.card{border-radius:0 !important;}</style>
<![endif]-->
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
  @media (max-width:620px){ .wrap{width:100% !important;} .pad{padding:22px 20px !important;} }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f8;" bgcolor="#f7f7f8">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f7f8;font-size:1px;line-height:1px;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f7f8" style="background-color:#f7f7f8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td class="banner pad" bgcolor="#9e9e9e" style="background-color:#9e9e9e;background-image:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;font-family:${FONT};">
            <img src="https://vexon-os.example/brand/vexon-logo-white.png" width="132" alt="Vexon OS" style="display:block;width:132px;height:auto;border:0;" />
            <h1 style="margin:14px 0 0;font-size:22px;line-height:28px;font-weight:700;color:#0f0f11;">${headline}</h1>
          </td>
        </tr>
        <tr><td height="16" style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td class="card pad" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;color:#111113;font-family:${FONT};font-size:15px;line-height:23px;">
            ${inner}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:14px;color:#5f5f66;font-family:${FONT};font-size:11px;line-height:16px;">Powered by Vexon OS<br/>${LEGAL_LINE}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Bulletproof button: solid fill everywhere, gradient where supported, VML for Outlook desktop. */
const button = (url: string, label: string) => {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr>
    <td align="center" bgcolor="#3d5a80" style="background-color:#3d5a80;background-image:linear-gradient(90deg,#3d5a80 0%,#5a5a5a 100%);border-radius:999px;mso-padding-alt:0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:300px;" arcsize="50%" fillcolor="#3d5a80" strokecolor="#3d5a80">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${safeUrl}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:999px;">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
};

const p = (html: string, extra = "") =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:#111113;${extra}">${html}</p>`;
const small = (html: string, extra = "") =>
  `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;color:#5f5f66;${extra}">${html}</p>`;

/** Plain-text twin for clients that show text/plain first. */
export function clientWelcomeEmailText(opts: {
  contactName: string;
  companyName: string;
  loginEmail: string;
  inviteUrl: string;
}) {
  const first = (opts.contactName || "").trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${first},`,
    "",
    `We're delighted to have ${opts.companyName} on board. Your personal client dashboard is ready. It will guide you through every step of onboarding, from telling us about your business to booking your onboarding call and going live.`,
    "",
    `You'll sign in with: ${opts.loginEmail}`,
    "",
    `Set your password and get started: ${opts.inviteUrl}`,
    "",
    "This link is personal to you and expires after a short while. If it stops working, reply to this email and we'll send a fresh one.",
    "",
    "Meridian · Powered by Vexon OS",
    LEGAL_LINE,
  ].join("\n");
}

/** The client's "your onboarding awaits" welcome — sent once payment is confirmed. */
export function clientWelcomeEmailHtml(opts: {
  contactName: string;
  companyName: string;
  loginEmail: string;
  inviteUrl: string;
}) {
  const first = escapeHtml((opts.contactName || "").trim().split(/\s+/)[0] || "there");
  return shell(
    "Welcome to Meridian: Your Onboarding Awaits 🚀",
    `${p(`Hi ${first},`)}
     ${p(`We're delighted to have ${escapeHtml(opts.companyName)} on board. Your personal client dashboard is ready. It will guide you through every step of onboarding, from telling us about your business to booking your onboarding call and going live.`)}
     ${small("You'll sign in with:", "margin:0 0 6px;")}
     <p style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:700;color:#2f4661;">${escapeHtml(opts.loginEmail)}</p>
     ${button(opts.inviteUrl, "Set your password & get started →")}
     ${small("This link is personal to you and expires after a short while. If it stops working, reply to this email and we'll send a fresh one.")}`,
    `Your ${opts.companyName} dashboard is ready. Set your password to begin onboarding.`
  );
}

/** Prominent CSM alert the moment a contract is signed — payment still to confirm. */
export function contractSignedCsmEmailHtml(opts: {
  companyName: string;
  signerName: string | null;
  signerEmail: string | null;
  source: string;
}) {
  return shell(
    "Contract signed: confirm payment ✍️",
    `${p(`<b>${escapeHtml(opts.companyName)}</b> has signed their agreement${
      opts.signerName ? ` (signed by ${escapeHtml(opts.signerName)}${opts.signerEmail ? `, ${escapeHtml(opts.signerEmail)}` : ""})` : ""
    }.`)}
     ${p(`Their onboarding is created and waiting. <b>Once you've confirmed payment has landed</b>, press <i>Confirm paid</i> on their onboarding. That sends their welcome email and opens their onboarding journey.`)}
     ${small(`Source: ${escapeHtml(opts.source)} · Vexon OS → Onboarding → Journeys`)}`
  );
}

/** Forgot-password email → the /welcome set-password page. */
export function passwordResetEmailHtml(opts: { resetUrl: string }) {
  return shell(
    "Reset your Vexon OS password",
    `${p("We received a request to reset your password. Click below to choose a new one:")}
     ${button(opts.resetUrl, "Choose a new password →")}
     ${small("If you didn't request this, you can safely ignore this email. Your password is unchanged. The link works once and expires after a short while.")}`
  );
}

/** Client-facing celebration when the CSM flips campaign live. */
export function campaignLiveEmailHtml(opts: { contactName: string; companyName: string; portalUrl: string }) {
  const first = escapeHtml((opts.contactName || "").trim().split(/\s+/)[0] || "there");
  return shell(
    "Your campaign is live 🎉",
    `${p(`Hi ${first},`)}
     ${p(`Your SDR team has started dialling for ${escapeHtml(opts.companyName)}. From here your dashboard shows every meeting booked, in real time.`)}
     ${button(opts.portalUrl, "Open your dashboard →")}`
  );
}

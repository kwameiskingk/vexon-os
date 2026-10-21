# Vexon OS

Vexon OS is a revenue-operations platform for outsourced sales and recruitment teams. It gives a CEO, operations lead, SDR managers, setters, finance, HR and the clients they serve one system to work from: bookings, pipeline, call review, hiring, onboarding, invoicing, payslips and a developer console, all on a single Supabase backend.

This repository is a white-labelled portfolio edition. Tenant data, people and client names in seeds and comments are fictional; every integration is driven by environment variables.

## Modules

| Module | What it does |
| --- | --- |
| **Kronos** (bookings) | Calendly-style booking pages per event type; Google and Microsoft calendar connect; round-robin setter rosters; reminders and callbacks by email and SMS; Meet / Teams link minting. |
| **Enquire** (forms) | Typeform-style form builder (`/f/<slug>`) with scoring and thresholds, media, webhooks and CRM push. |
| **Trial Day** | Trialist pipeline from application to hired: qualification, three booking slots, CSM QA and hand-off to a setter. |
| **Sales / SDR** | Setter and SDR-manager portals: targets, pace curves, leaderboards, call review with AI scoring, team goals. |
| **CSM / Client Health** | Client lifecycle, health sheet, meeting scores, renewals calculator, client portal with onboarding deck. |
| **Finance** | Client invoices (PDF + email, mark paid), payslips, commissions, Xero hooks. |
| **HR & Hiring (TA)** | Candidate intake, CV screening, phone screens, onboarding flow builder with sandboxes and checklists. |
| **GTM / Marketing** | Outbound campaigns, senders, LinkedIn and email reporting, lead notifications. |
| **Ops Command** | Cross-department operations view for the operations lead. |
| **Dev Centre** | Integrations switches, user and access truth, maintenance, mandate module, UI/brand preview and a console. |

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), TanStack Query, React Router.
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security, `pg_cron`), 87 Deno edge functions under `supabase/functions`, 533 SQL migrations under `supabase/migrations`.
- **Integrations (all optional, env-driven):** Close CRM, Google Calendar/Sheets, Microsoft Graph, Resend, Twilio, Anthropic / OpenAI-compatible gateway, Clay, HeyReach, Smartlead, Kit, PandaDoc, Xero, n8n, Zapier.

## Local run

Prerequisites: Node 20+, [Bun](https://bun.sh) (the lockfile is `bun.lock`), the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

```bash
bun install --frozen-lockfile
cp .env.example .env            # fill in the VITE_* values printed by `supabase start`

supabase start                  # local Postgres + Auth + Storage + functions
supabase db reset               # applies supabase/migrations
supabase functions serve        # edge functions (reads supabase/functions/.env)

bun run dev                     # http://localhost:8080
```

Useful checks:

```bash
npx tsc -p tsconfig.app.json --noEmit   # type-check (the root tsconfig is references-only)
bun run build                           # production bundle
bun run lint
```

Two cron migrations (`*_booking_reminders_cron.sql`, `*_booking_rules.sql`) call edge functions with `YOUR_PROJECT_REF` and `YOUR_SUPABASE_ANON_KEY` placeholders; fill them in or skip those migrations locally.

## Environment

The full list with one-line descriptions is in [`.env.example`](.env.example). Summary:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | browser | Supabase client and dashboard links |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | edge functions | injected by Supabase; service role for admin writes |
| `APP_ORIGIN`, `INTERNAL_FUNCTION_SECRET` | edge functions | public origin for links; function-to-function auth |
| `CLOSE_API_KEY*`, `CLOSE_SIGNATURE_KEY` | CRM sync, webhooks | one key per Close organisation |
| `GOOGLE_*`, `MICROSOFT_*` | Kronos | calendar connect OAuth apps |
| `RESEND_*`, `*_FROM`, `*_REPLY_TO`, `INVOICE_ASSET_BASE` | email | senders for bookings, onboarding, invoices, payslips |
| `TWILIO_*` | SMS | reminders and callbacks |
| `ANTHROPIC_API_KEY`, `AI_GATEWAY_API_KEY`, `AI_GATEWAY_URL` | AI | call review and CV screening |
| `*_WEBHOOK_SECRET`, `*_CALLBACK_SECRET`, `*_API_KEY` | integrations | Clay, HeyReach, Smartlead, Kit, PandaDoc, Xero, n8n, Zapier, Typeform |

## Repository layout

```
src/            React app (pages per portal, components, hooks, lib)
src/assets/     Vexon logo SVGs
public/         favicon, brand PNGs, onboarding placeholders
supabase/       config.toml, migrations/, functions/ (Deno), _shared/ helpers
scripts/        test-renewal-calc.mjs
.github/        PR template and lint-delta check
```

## Licence

All rights reserved. See [LICENSE](LICENSE).

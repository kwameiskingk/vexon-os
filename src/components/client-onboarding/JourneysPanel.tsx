// Staff tracking surface for client onboarding journeys: the trigger queue
// ("signed — confirm payment"), per-client progress, and the detail sheet with
// the CSM controls (resend welcome, unlock a stage, waive a step, mark live).

import { onboardingAnswerFlags } from "@/lib/forms/onboardingFlags";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Mail,
  Rocket,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useLatestInvoiceByClient } from "@/hooks/useClientInvoices";
import { useAuth } from "@/contexts/AuthContext";
import { fmtGBP, INVOICE_STATUS_LABEL } from "@/lib/invoices/invoiceMaths";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  useJourneyAdminAction,
  useJourneyDetail,
  useJourneysOverview,
  type JourneyOverviewRow,
} from "@/hooks/useClientOnboardingAdmin";

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

export function JourneysPanel() {
  const { data, isLoading, error } = useJourneysOverview();
  const [detailId, setDetailId] = useState<string | null>(null);
  const act = useJourneyAdminAction();
  // 9 Oct 2026: show whether the invoice is out / paid next to each signed
  // client, and a door to raise one (CEO → Invoices). Hook sits above the
  // early returns below so it runs on every render.
  const awaitingIds = (data?.journeys ?? []).filter((j) => j.status === "awaiting_payment").map((j) => j.client_profile_id);
  const { data: invoiceByClient } = useLatestInvoiceByClient(awaitingIds, !isLoading && !error);
  // CEO → Invoices is admin/dev only; everyone else just sees the state.
  const { userRoles } = useAuth();
  const canRaiseInvoice = userRoles.includes("admin") || userRoles.includes("dev");

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-violet-500" />;
  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        Journeys aren't available yet — run migration <code>20260826130000_client_onboarding_flow.sql</code>{" "}
        and deploy <code>client-onboarding-admin</code>.
      </p>
    );
  }

  const journeys = data?.journeys ?? [];
  const awaiting = journeys.filter((j) => j.status === "awaiting_payment");
  const rest = journeys.filter((j) => j.status !== "awaiting_payment");

  const confirmPaid = async (row: JourneyOverviewRow) => {
    try {
      const res = await act.mutateAsync({ action: "confirm_paid", client_profile_id: row.client_profile_id });
      toast.success(
        res?.invite_sent
          ? `Payment confirmed — welcome email sent to ${row.email}`
          : "Payment confirmed, but the welcome email failed — use Resend welcome"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm payment");
    }
  };

  return (
    <div className="space-y-5">
      {awaiting.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Signed — awaiting payment confirmation ({awaiting.length})
          </p>
          {awaiting.map((row) => (
            <div key={row.client_profile_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {row.company_name}
                  {row.is_test && <TestBadge />}
                </p>
                <p className="text-xs text-muted-foreground">
                  Signed {fmtDate(row.contract_signed_at)} · {row.email || "no email on profile"} · via {row.source}
                </p>
              </div>
              {(() => {
                const inv = invoiceByClient?.[row.client_profile_id];
                if (!inv) {
                  return canRaiseInvoice ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/admin/ceo/invoices?client=${row.client_profile_id}`}>Raise invoice</Link>
                    </Button>
                  ) : (
                    <Badge variant="secondary">No invoice yet</Badge>
                  );
                }
                const tone = inv.status === "paid"
                  ? "bg-emerald-100 text-emerald-700"
                  : inv.status === "sent" ? "bg-sky-100 text-sky-700" : "bg-muted text-muted-foreground";
                const chip = (
                  <Badge className={`${tone} border-0`}>
                    Invoice {inv.invoice_number} · {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                    {inv.total_amount != null ? ` · ${fmtGBP(Number(inv.total_amount))}` : ""}
                  </Badge>
                );
                return canRaiseInvoice ? <Link to="/admin/ceo/invoices" className="shrink-0">{chip}</Link> : <span className="shrink-0">{chip}</span>;
              })()}
              <Button
                size="sm"
                className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0"
                disabled={act.isPending}
                onClick={() => confirmPaid(row)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm paid
              </Button>
            </div>
          ))}
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Confirming payment provisions the login, sends the welcome email, and opens the client's journey.
          </p>
        </div>
      )}

      {rest.length === 0 && awaiting.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No journeys yet — they start automatically when a contract is signed, from a client profile's
          Onboarding tab, or from the Dev Center test button.
        </p>
      )}

      <div className="space-y-2">
        {rest.map((row) => (
          <button
            key={row.client_profile_id}
            type="button"
            onClick={() => setDetailId(row.client_profile_id)}
            className="w-full rounded-xl border bg-card px-4 py-3 flex flex-wrap items-center gap-3 text-left hover:border-violet-300 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {row.company_name}
                {row.is_test && <TestBadge />}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.status === "completed"
                  ? `Live since ${fmtDate(row.campaign_live_at)}`
                  : row.active_stage
                    ? `On: ${row.active_stage}`
                    : "In progress"}
                {" · "}welcome {row.welcome_email_sent_at ? "sent" : "not sent"}
                {" · "}signed in {row.first_signed_in_at ? "✓" : "not yet"}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {row.ready_for_live && row.status !== "completed" && (
                <Badge className="bg-violet-100 text-violet-700 border-0">Ready for live</Badge>
              )}
              <div className="w-28">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
                    style={{ width: `${row.progress_pct}%` }}
                  />
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mt-1 text-right">{row.progress_pct}%</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <JourneyDetailSheet clientProfileId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function TestBadge() {
  return (
    <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">
      TEST
    </span>
  );
}

/* ── Detail sheet ────────────────────────────────────────────────────────── */

export function JourneyDetailSheet({
  clientProfileId,
  onClose,
}: {
  clientProfileId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useJourneyDetail(clientProfileId);
  const act = useJourneyAdminAction();

  const run = async (
    action: string,
    extra: Record<string, unknown>,
    okMsg: string
  ) => {
    try {
      const res = await act.mutateAsync({ action, client_profile_id: clientProfileId, ...extra });
      if (res?.needs_force) {
        if (window.confirm("The client hasn't finished every stage. Flip campaign live anyway?")) {
          await act.mutateAsync({ action, client_profile_id: clientProfileId, ...extra, force: true });
        } else return;
      }
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    }
  };

  const journey = data?.journey;
  const campaign = (data?.campaign ?? null) as CampaignRow | null;
  const stages = (data?.stages ?? []) as Array<{
    stage_key: string;
    title: string;
    state: string;
    tasks: Array<{
      step_key: string;
      label: string;
      step_type: string;
      is_completed: boolean;
      waived_at: string | null;
      answers: Record<string, unknown> | null;
      file_path: string | null;
    }>;
  }>;

  return (
    <Sheet open={!!clientProfileId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">Onboarding journey</SheetTitle>
        </SheetHeader>
        {isLoading || !journey ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="space-y-5 py-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="outline"
                disabled={act.isPending || journey.status === "awaiting_payment"}
                onClick={() => run("resend_welcome", {}, "Welcome email re-sent")}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" /> Resend welcome
              </Button>
              {journey.status !== "completed" && campaign && (
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0"
                  disabled={act.isPending}
                  onClick={() =>
                    run("mark_live", {}, "Campaign started 🎉")
                  }
                >
                  <Rocket className="h-3.5 w-3.5 mr-1.5" /> Start campaign
                </Button>
              )}
              {journey.is_test && (
                <Button
                  size="sm" variant="destructive"
                  disabled={act.isPending}
                  onClick={async () => {
                    await run("delete_test_client", {}, "Test client fully cleaned up");
                    onClose();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete test client
                </Button>
              )}
            </div>

            <CampaignBlock
              clientProfileId={clientProfileId!}
              campaign={campaign}
              readyForLive={data?.ready_for_live === true}
              journeyCompleted={journey.status === "completed"}
              act={act}
            />

            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Signed {fmtDate(journey.contract_signed_at)} · paid {fmtDate(journey.payment_confirmed_at)} · welcome {fmtDate(journey.welcome_email_sent_at)}</p>
              <p>
                Calendar: {data?.calendar_connection?.status ?? "not invited"}
                {data?.calendar_connection?.calendar_email ? ` · ${data.calendar_connection.calendar_email}` : ""}
              </p>
            </div>

            <div className="space-y-3">
              {stages.map((stage, i) => (
                <div key={stage.stage_key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {i + 1}. {stage.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          stage.state === "complete"
                            ? "border-emerald-300 text-emerald-700"
                            : stage.state === "active"
                              ? "border-violet-300 text-violet-700"
                              : "text-muted-foreground"
                        }
                      >
                        {stage.state}
                      </Badge>
                      {stage.state === "locked" && stage.stage_key !== "campaign_live" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs"
                          disabled={act.isPending}
                          onClick={() => run("override_stage", { stage_key: stage.stage_key }, "Stage unlocked for this client")}
                        >
                          <Unlock className="h-3 w-3 mr-1" /> Unlock
                        </Button>
                      )}
                    </div>
                  </div>
                  {stage.tasks.map((t) => (
                    <div key={t.step_key} className="pl-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={t.is_completed || t.waived_at ? "text-emerald-600" : "text-muted-foreground"}>
                          {t.is_completed || t.waived_at ? "✓" : "○"}
                        </span>
                        <span className={`flex-1 min-w-0 ${t.is_completed || t.waived_at ? "" : "text-muted-foreground"}`}>
                          {t.label}
                          {t.waived_at && <span className="text-[10px] font-mono text-amber-600 ml-1.5">waived</span>}
                        </span>
                        {!t.is_completed && !t.waived_at && stage.state !== "complete" && (
                          <Button
                            size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground"
                            disabled={act.isPending}
                            onClick={() => run("waive_step", { step_key: t.step_key }, "Step waived")}
                          >
                            Waive
                          </Button>
                        )}
                        {(t.is_completed || t.waived_at) && journey.status === "active" && (
                          <Button
                            size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground"
                            disabled={act.isPending}
                            title="Put this card back in front of the client, keeping what they entered"
                            onClick={() => {
                              if (window.confirm(`Reopen "${t.label}" for the client? Their answers are kept; the card goes back to the front of their deck.`)) {
                                run("reopen_step", { step_key: t.step_key }, "Card reopened for the client");
                              }
                            }}
                          >
                            Reopen
                          </Button>
                        )}
                        {t.file_path && data?.files?.[t.step_key] && (
                          <a
                            href={data.files[t.step_key]}
                            target="_blank" rel="noreferrer"
                            className="text-violet-600 inline-flex items-center gap-1 text-xs"
                          >
                            file <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {t.answers && <TaskAnswers task={t} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── Campaign creation + start ───────────────────────────────────────────────
 * Daniel's ruling (26 Aug): at 100% the CSM creates the campaign (name, start
 * date, duration) and then STARTS it by hand — "there could be delays", and
 * starting it is what he wants to be accountable for. Creation leaves the
 * campaign 'pending' (invisible to the client); starting it flips it to
 * 'active', which is what the client's dashboard and weekly-goal card read,
 * and releases them from the onboarding journey into the live portal.
 */
export interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

const DURATIONS = [3, 6, 9] as const;

function CampaignBlock({
  clientProfileId,
  campaign,
  readyForLive,
  journeyCompleted,
  act,
}: {
  clientProfileId: string;
  campaign: CampaignRow | null;
  readyForLive: boolean;
  journeyCompleted: boolean;
  act: ReturnType<typeof useJourneyAdminAction>;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState<number>(3);
  const [customMonths, setCustomMonths] = useState("");
  const [editing, setEditing] = useState(false);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const resolvedMonths = months === 0 ? Number(customMonths) : months;

  const create = async () => {
    try {
      await act.mutateAsync({
        action: "create_campaign",
        client_profile_id: clientProfileId,
        name,
        start_date: startDate,
        duration_months: resolvedMonths,
      });
      toast.success("Campaign created — press Start when you're ready to go live");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the campaign");
    }
  };

  const saveDates = async () => {
    try {
      await act.mutateAsync({
        action: "update_campaign",
        client_profile_id: clientProfileId,
        ...(editStart ? { start_date: editStart } : {}),
        ...(editEnd ? { end_date: editEnd } : {}),
      });
      setEditing(false);
      toast.success("Campaign dates updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the dates");
    }
  };

  if (campaign) {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-violet-500" /> {campaign.name}
          </p>
          <Badge
            variant="outline"
            className={
              campaign.status === "active"
                ? "border-emerald-300 text-emerald-700"
                : "border-amber-300 text-amber-700"
            }
          >
            {campaign.status === "active" ? "running" : "not started"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {fmtDate(campaign.start_date)} → {fmtDate(campaign.end_date)}
        </p>
        {editing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Start</label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={editStart || campaign.start_date || ""}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">End</label>
                <Input
                  type="date"
                  className="h-8 text-sm"
                  value={editEnd || campaign.end_date || ""}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveDates} disabled={act.isPending}>Save dates</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Changing the dates rebuilds the weekly goals for this campaign.
            </p>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)}>
            Adjust dates
          </Button>
        )}
      </div>
    );
  }

  if (journeyCompleted) return null;

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${readyForLive ? "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20" : ""}`}>
      <div>
        <p className="text-sm font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-500" /> Create the campaign
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {readyForLive
            ? "Onboarding is complete — set this up, then start it when you're ready."
            : "You can set this up now; nothing reaches the client until you press Start."}
        </p>
      </div>
      <div className="space-y-2">
        <Input
          className="h-8 text-sm"
          placeholder="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Start date</label>
            <Input
              type="date"
              className="h-8 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Duration</label>
            <div className="flex gap-1">
              {DURATIONS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={months === d ? "default" : "outline"}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setMonths(d)}
                >
                  {d}m
                </Button>
              ))}
              <Button
                size="sm"
                variant={months === 0 ? "default" : "outline"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setMonths(0)}
              >
                Custom
              </Button>
            </div>
          </div>
        </div>
        {months === 0 && (
          <Input
            type="number"
            min={1}
            max={36}
            className="h-8 text-sm max-w-[10rem]"
            placeholder="Months"
            value={customMonths}
            onChange={(e) => setCustomMonths(e.target.value)}
          />
        )}
      </div>
      <Button
        size="sm"
        className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white border-0"
        disabled={!name.trim() || !startDate || !resolvedMonths || act.isPending}
        onClick={create}
      >
        {act.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
        Create campaign
      </Button>
    </div>
  );
}

/* Form answers are long; the full set lives on the client profile's Documents
 * tab (Daniel's ruling). Here they stay collapsed so the journey reads as a
 * checklist rather than a wall of text. */
function TaskAnswers({
  task,
}: {
  task: {
    step_type: string;
    answers: Record<string, unknown> | null;
  };
}) {
  const a = (task.answers ?? {}) as { declined?: boolean; reason?: string; items?: string[]; answer?: string; file_paths?: string[]; note?: string };
  const isForm = task.step_type === "form";
  const [open, setOpen] = useState(!isForm);
  const flags = isForm ? onboardingAnswerFlags(task.answers) : [];

  if (task.step_type === "yes_no") {
    const files = Array.isArray(a.file_paths) ? a.file_paths : [];
    const items = Array.isArray(a.items) ? a.items : [];
    return (
      <div className="ml-6 mt-1 rounded-md bg-muted/40 p-2 space-y-1">
        <p className={`text-xs ${a.answer === "no" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          {a.answer === "no"
            ? `Client said no${a.note ? ` — "${a.note}"` : ""}`
            : `Client said yes${files.length ? ` · ${files.length} file${files.length === 1 ? "" : "s"}` : ""}${items.length ? ` · ${items.length} entr${items.length === 1 ? "y" : "ies"}` : ""}`}
        </p>
        {items.map((item, j) => (
          <p key={j} className="text-xs text-muted-foreground">• {item}</p>
        ))}
      </div>
    );
  }

  if (a.declined) {
    return (
      <div className="ml-6 mt-1 rounded-md bg-muted/40 p-2">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Client said they have nothing to add{a.reason ? ` — "${a.reason}"` : ""}
        </p>
      </div>
    );
  }

  const entries = Array.isArray(a.items)
    ? a.items.map((item, i) => [String(i), item] as [string, unknown])
    : Object.entries(task.answers ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="ml-6 mt-1 rounded-md bg-muted/40 p-2 space-y-1">
      {flags.map((f) => (
        <p key={f} className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <span aria-hidden>⚑</span> {f}
        </p>
      ))}
      {isForm && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {open ? "Hide" : `Show ${entries.length} answers`}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open &&
        (Array.isArray(a.items)
          ? a.items.map((item, j) => (
              <p key={j} className="text-xs text-muted-foreground">• {item}</p>
            ))
          : entries
              .filter(([k]) => k !== "file_paths")
              .map(([k, v]) => (
                <p key={k} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{k.replace(/_/g, " ")}:</span>{" "}
                  {Array.isArray(v)
                    ? v.map(String).join(", ")
                    : v && typeof v === "object"
                      ? Object.values(v as Record<string, unknown>).map((x) => String(x ?? "")).filter(Boolean).join(", ")
                      : String(v)}
                </p>
              )))}
      {isForm && open && (
        <p className="text-[11px] text-muted-foreground/70 pt-1">
          Also on the client profile → Config → Documents.
        </p>
      )}
    </div>
  );
}

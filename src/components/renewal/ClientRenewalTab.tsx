import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import {
  computeRenewal,
  coerce,
  count,
  money,
  methodologyNote,
  netText,
  roiText,
  showRateText,
  SCENARIOS,
  type RenewalCalcOutput,
  type ScenarioFactor,
} from "@/lib/renewal/renewalCalc";
import "./renewal.css";

/**
 * Renewal ROI tool — Vexon OS port of the signed-off artefact
 * (docs/renewals/renewal-roi-presenter.html). Structure, copy, palette and
 * maths are the artefact's own; what's added is exactly what the prototype
 * lacked: live auto-fields, per-client persistence of the manual figures,
 * an immutable snapshot each time present mode is entered, and PDF export.
 *
 * AUTO  (refresh live on every open, editable in-session, never persisted):
 *       client name, campaign period, meetings booked, meetings sat.
 * MANUAL (persisted per client in renewal_manual_fields, staleness marker):
 *       vacancies, placement fee, campaign investment, ongoing monthly,
 *       goals 1–3. Nothing here writes back to client health.
 */

type ManualField =
  | "vacancies"
  | "placement_fee"
  | "campaign_investment"
  | "monthly_investment"
  | "goal1"
  | "goal2"
  | "goal3";

const NUMERIC_FIELDS: ManualField[] = ["vacancies", "placement_fee", "campaign_investment", "monthly_investment"];

interface ManualRow {
  field: ManualField;
  value_numeric: number | null;
  value_text: string | null;
  edited_at: string;
}

interface PresentationRow {
  id: string;
  presented_by: string;
  presented_at: string;
  scenario: "low" | "expected" | "high";
  figures: {
    inputs: Record<string, string>;
    computed?: RenewalCalcOutput;
  };
}

const scenarioByKey = (key: string) => SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[1];

const editedMarker = (editedAt: string | undefined) => {
  if (!editedAt) return null;
  const days = differenceInDays(new Date(), new Date(editedAt));
  const text = days <= 0 ? "edited today" : days === 1 ? "edited 1 day ago" : `edited ${days} days ago`;
  return { text, stale: days > 30 };
};

export const ClientRenewalTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ---------- Data ----------

  const { data: client } = useQuery({
    queryKey: ["renewal-client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, company_name, campaign_start_date, campaign_end_date, contract_value")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as {
        company_name: string | null;
        campaign_start_date: string | null;
        campaign_end_date: string | null;
        contract_value: number | null;
      };
    },
  });

  // Live booked / sat / vacancies-default: the same numbers the client-health
  // page shows (Stage 2 resolved values — override if present, else computed).
  const { data: health } = useQuery({
    queryKey: ["renewal-live-counts", clientId],
    queryFn: async () => {
      const { data: meetings, error } = await supabase
        .from("meetings")
        .select("id, attendance_status, attendance_confirmed, meeting_date")
        .eq("client_profile_id", clientId)
        .eq("department", "fulfilment");
      if (error) throw error;
      const today = Date.now();
      const due = (meetings || []).filter((m) => {
        if (m.attendance_status === "rescheduled") return false;
        const t = Date.parse(String(m.meeting_date ?? ""));
        return Number.isFinite(t) && t <= today;
      });
      const sat = due.filter((m) => m.attendance_confirmed === true || m.attendance_status === "sat");
      const [openingRes, overridesRes, catchupsRes] = await Promise.all([
        supabase
          .from("client_health_opening_balances")
          .select("opening_booked, opening_sat, vacancies")
          .eq("client_profile_id", clientId)
          .maybeSingle(),
        supabase
          .from("client_health_metric_overrides" as never)
          .select("*")
          .eq("client_profile_id", clientId),
        supabase
          .from("client_catchups")
          .select("vacancies_open, status, created_at")
          .eq("client_profile_id", clientId)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const opening = openingRes.data as { opening_booked: number | null; opening_sat: number | null; vacancies: number | null } | null;
      const ov = new Map(
        ((overridesRes.data ?? []) as unknown as { metric: string; value: number }[]).map((o) => [o.metric, Number(o.value)]),
      );
      const computedBooked = (Number(opening?.opening_booked) || 0) + due.length;
      const computedSat = (Number(opening?.opening_sat) || 0) + sat.length;
      const latestCatchupVac = ((catchupsRes.data ?? []) as { vacancies_open: number | null }[]).find(
        (c) => c.vacancies_open != null,
      )?.vacancies_open;
      const computedVacancies = latestCatchupVac ?? opening?.vacancies ?? null;
      return {
        booked: ov.get("meetings_booked") ?? computedBooked,
        sat: ov.get("meetings_sat") ?? computedSat,
        vacancies: ov.get("vacancies") ?? (computedVacancies != null ? Number(computedVacancies) : null),
      };
    },
  });

  const { data: manualRows } = useQuery({
    queryKey: ["renewal-manual-fields", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_manual_fields" as never)
        .select("*")
        .eq("client_profile_id", clientId);
      if (error) throw error;
      return (data ?? []) as unknown as ManualRow[];
    },
  });

  const { data: presentations } = useQuery({
    queryKey: ["renewal-presentations", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_presentations" as never)
        .select("*")
        .eq("client_profile_id", clientId)
        .order("presented_at", { ascending: false })
        .limit(36);
      if (error) throw error;
      return (data ?? []) as unknown as PresentationRow[];
    },
  });

  const presenterIds = useMemo(
    () => Array.from(new Set((presentations ?? []).map((p) => p.presented_by).filter(Boolean))),
    [presentations],
  );
  const { data: presenterNames } = useQuery({
    queryKey: ["renewal-presenter-names", presenterIds],
    enabled: presenterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", presenterIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        map[p.id] = p.full_name || p.email || "Unknown";
      });
      return map;
    },
  });

  const manualByField = useMemo(() => {
    const map = new Map<ManualField, ManualRow>();
    (manualRows ?? []).forEach((r) => map.set(r.field, r));
    return map;
  }, [manualRows]);

  // ---------- Field state ----------

  const [scenarioKey, setScenarioKey] = useState<"low" | "expected" | "high">("expected");
  const [presenting, setPresenting] = useState(false);
  const [viewing, setViewing] = useState<PresentationRow | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({
    clientName: "",
    periodText: "",
    booked: "",
    sat: "",
    vacancies: "",
    fee: "",
    investment: "",
    monthly: "",
    goal1: "",
    goal2: "",
    goal3: "",
  });
  const seeded = useRef(false);

  // Seed once per mount: AUTO fields from live data, MANUAL fields from their
  // persisted rows (with the documented defaults when no row exists yet).
  useEffect(() => {
    if (seeded.current || !client || health === undefined || manualRows === undefined) return;
    seeded.current = true;
    const start = client.campaign_start_date ? new Date(client.campaign_start_date) : null;
    const end = client.campaign_end_date ? new Date(client.campaign_end_date) : null;
    const period =
      start && end
        ? `${format(start, start.getFullYear() === end.getFullYear() ? "MMM" : "MMM yyyy")} – ${format(end, "MMM yyyy")}`
        : start
          ? `From ${format(start, "MMM yyyy")}`
          : "";
    const manualNum = (f: ManualField) => {
      const v = manualByField.get(f)?.value_numeric;
      return v != null ? String(v) : "";
    };
    const manualText = (f: ManualField) => manualByField.get(f)?.value_text ?? "";
    setInputs({
      clientName: client.company_name ?? "",
      periodText: period,
      booked: health?.booked != null ? String(health.booked) : "",
      sat: health?.sat != null ? String(health.sat) : "",
      // Vacancies default from the resolved client-health value until Daniel
      // first saves his own figure; then the persisted value owns the field.
      vacancies: manualNum("vacancies") || (health?.vacancies != null ? String(health.vacancies) : ""),
      fee: manualNum("placement_fee"),
      investment:
        manualNum("campaign_investment") ||
        (client.contract_value && Number(client.contract_value) > 0 ? String(client.contract_value) : ""),
      // Ongoing monthly is the proposed RENEWAL price: blank until typed,
      // never defaulted from the campaign price.
      monthly: manualNum("monthly_investment"),
      goal1: manualText("goal1"),
      goal2: manualText("goal2"),
      goal3: manualText("goal3"),
    });
  }, [client, health, manualRows, manualByField]);

  const setInput = (key: string, value: string) => setInputs((s) => ({ ...s, [key]: value }));

  // ---------- Persistence (manual fields, save on blur) ----------

  const saveManual = async (field: ManualField, inputKey: string) => {
    const raw = (inputs[inputKey] ?? "").trim();
    const existing = manualByField.get(field);
    const isNumeric = NUMERIC_FIELDS.includes(field);
    try {
      if (raw === "") {
        if (!existing) return;
        const { error } = await supabase
          .from("renewal_manual_fields" as never)
          .delete()
          .eq("client_profile_id", clientId)
          .eq("field", field);
        if (error) throw error;
      } else {
        const valueNumeric = isNumeric ? coerce(raw) : null;
        const valueText = isNumeric ? null : raw;
        if (existing && existing.value_numeric === valueNumeric && (existing.value_text ?? "") === (valueText ?? "")) {
          return; // unchanged — keep the original edited stamp
        }
        const { error } = await supabase.from("renewal_manual_fields" as never).upsert(
          {
            client_profile_id: clientId,
            field,
            value_numeric: valueNumeric,
            value_text: valueText,
            edited_by: user?.id,
            edited_at: new Date().toISOString(),
          } as never,
          { onConflict: "client_profile_id,field" },
        );
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["renewal-manual-fields", clientId] });
    } catch (e) {
      console.error("Failed to save renewal field:", e);
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  // ---------- Computation ----------

  const liveFactor = scenarioByKey(scenarioKey).factor as ScenarioFactor;
  const effInputs = viewing ? viewing.figures.inputs : inputs;
  const effScenario = viewing ? scenarioByKey(viewing.scenario) : scenarioByKey(scenarioKey);
  const out = useMemo(
    () =>
      computeRenewal(
        {
          booked: coerce(effInputs.booked),
          sat: coerce(effInputs.sat),
          vacancies: coerce(effInputs.vacancies),
          fee: coerce(effInputs.fee),
          investment: coerce(effInputs.investment),
          monthly: coerce(effInputs.monthly),
        },
        effScenario.factor as ScenarioFactor,
      ),
    [effInputs, effScenario],
  );

  // Never flash the artefact's "Client name" placeholder while queries load:
  // fall straight through to the profile's name, and show nothing (not wrong
  // text) for the instant before the client row arrives.
  const clientTitle =
    (effInputs.clientName ?? "").trim() || (client?.company_name ?? "").trim() || (client ? "Client name" : " ");
  const periodLine = (effInputs.periodText ?? "").trim()
    ? `Three-month campaign · ${(effInputs.periodText ?? "").trim()}`
    : "Three-month campaign";
  const railMax = Math.max(out.a.fees, out.b.fees, out.c.fees, out.a.investment, out.b.investment, 1);
  const note = methodologyNote(coerce(effInputs.fee), effScenario.factor as ScenarioFactor, effScenario.label).replace(
    "How these numbers are built. ",
    "",
  );

  // ---------- Present mode: snapshot on entry ----------

  const enterPresentMode = async () => {
    if (viewing) {
      // Re-presenting a past snapshot: display it, but never write a duplicate.
      setPresenting(true);
      return;
    }
    try {
      const { error } = await supabase.from("renewal_presentations" as never).insert({
        client_profile_id: clientId,
        presented_by: user?.id,
        scenario: scenarioKey,
        figures: { inputs, computed: out },
      } as never);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["renewal-presentations", clientId] });
      toast.success("Presentation recorded");
    } catch (e) {
      console.error("Failed to record presentation:", e);
      toast.error(e instanceof Error ? e.message : "Failed to record presentation");
    }
    setPresenting(true);
  };

  // ---------- Render helpers ----------

  const marker = (field: ManualField) => {
    const m = editedMarker(manualByField.get(field)?.edited_at);
    if (!m) return null;
    return <span className={m.stale ? "edited edited--stale" : "edited"}>{m.text}</span>;
  };

  const scenarioCard = (
    kind: "a" | "b" | "c",
    tag: string,
    heading: string,
    sub: string,
    cardClass: string,
  ) => {
    const s = out[kind];
    return (
      <article className={`card ${cardClass}`.trim()}>
        <div>
          <span className="tag">{tag}</span>
        </div>
        <h3>{heading}</h3>
        <p className="sub">{sub}</p>
        <dl className="rows">
          <div className="row">
            <dt>Meetings booked</dt>
            <dd>{count(s.booked)}</dd>
          </div>
          <div className="row">
            <dt>Meetings sat</dt>
            <dd>{count(s.sat)}</dd>
          </div>
          <div className="row">
            <dt>Show-up rate</dt>
            <dd>{showRateText(s.booked, s.sat)}</dd>
          </div>
          <div className="row">
            <dt>Vacancies produced</dt>
            <dd>{count(s.vacancies)}</dd>
          </div>
          <div className="row row--headline">
            <dt>Potential placement fees</dt>
            <dd>{money(s.fees)}</dd>
          </div>
          <div className="row">
            <dt>Investment</dt>
            <dd>{money(s.investment)}</dd>
          </div>
        </dl>
        <div className="payoff">
          <div className="label">Return on investment</div>
          <div className="multiple">{roiText(s.fees, s.investment)}</div>
          <div className="net">{netText(s.fees, s.investment)}</div>
        </div>
      </article>
    );
  };

  const barRow = (kind: "a" | "b" | "c", name: string, subNote: string) => {
    const s = out[kind];
    return (
      <div className="bar-row">
        <div className="name">
          {name}
          <span>{subNote}</span>
        </div>
        <div className="track">
          <div className="bar-return" style={{ width: `${(s.fees / railMax) * 100}%` }} />
          <div className="bar-invest" style={{ width: `${(s.investment / railMax) * 100}%` }} />
        </div>
        <div className="figure">{money(s.fees)}</div>
      </div>
    );
  };

  const goalBlock = (question: string, answer: string) => (
    <div className="goal">
      <p className="q">{question}</p>
      {answer.trim() ? (
        <p className="a">{answer.trim()}</p>
      ) : (
        <p className="a empty">Add their answer in the figures panel</p>
      )}
    </div>
  );

  const numField = (
    label: string,
    key: string,
    opts: { hint?: string; manual?: ManualField; step?: number } = {},
  ) => (
    <div className="field">
      <label htmlFor={`rn-${key}`}>{label}</label>
      <input
        id={`rn-${key}`}
        type="number"
        min={0}
        step={opts.step ?? 1}
        value={inputs[key] ?? ""}
        onChange={(e) => setInput(key, e.target.value)}
        onBlur={opts.manual ? () => saveManual(opts.manual!, key) : undefined}
      />
      {opts.hint && <span className="hint">{opts.hint}</span>}
      {opts.manual && marker(opts.manual)}
    </div>
  );

  return (
    <div className="renewal-scope">
      <div className="wrap">
        <header className="masthead">
          <div>
            <p className="eyebrow">Campaign review</p>
            <h1>{clientTitle}</h1>
            <p className="period">{periodLine}</p>
          </div>
          <div>
            <p className="prepared">Prepared by</p>
            <p className="brandmark">
              <i className="chip" />
              Rec<span>Rev</span>
            </p>
          </div>
        </header>

        {viewing && (
          <div className="snapshot-banner">
            <span>
              Viewing the presentation from {format(new Date(viewing.presented_at), "d MMM yyyy, HH:mm")} ·{" "}
              {scenarioByKey(viewing.scenario).label} case — figures are frozen as shown that day.
            </span>
            <button type="button" className="ghost-btn" onClick={() => setViewing(null)}>
              Back to live
            </button>
          </div>
        )}

        <div className="controls">
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="seg-label">Projection</span>
            <div className="segmented" role="group" aria-label="Projection confidence">
              {SCENARIOS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={(viewing ? viewing.scenario : scenarioKey) === s.key || undefined}
                  disabled={!!viewing}
                  onClick={() => setScenarioKey(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="ghost-btn" onClick={() => window.print()}>
              Export PDF
            </button>
            {presenting ? (
              <button type="button" className="ghost-btn" onClick={() => setPresenting(false)}>
                Edit figures
              </button>
            ) : (
              <button type="button" className="ghost-btn" onClick={enterPresentMode}>
                Hide figures
              </button>
            )}
          </div>
        </div>

        {!presenting && !viewing && (
          <section className="panel">
            <h2>Campaign figures</h2>
            <div className="fields">
              <div className="field">
                <label htmlFor="rn-clientName">Client</label>
                <input
                  id="rn-clientName"
                  type="text"
                  value={inputs.clientName}
                  readOnly
                  autoComplete="off"
                />
                <span className="hint">From the client profile</span>
              </div>
              <div className="field">
                <label htmlFor="rn-periodText">Campaign period</label>
                <input
                  id="rn-periodText"
                  type="text"
                  value={inputs.periodText}
                  onChange={(e) => setInput("periodText", e.target.value)}
                  autoComplete="off"
                />
                <span className="hint">From campaign dates — edit freely</span>
              </div>
              {numField("Meetings booked", "booked", { hint: "Live from Vexon OS — refreshes on open" })}
              {numField("Meetings sat", "sat", { hint: "Live from Vexon OS — refreshes on open" })}
              {numField("Vacancies produced", "vacancies", { manual: "vacancies" })}
              {numField("Average placement fee (£)", "fee", { manual: "placement_fee", step: 100 })}
              {numField("Campaign investment (£)", "investment", {
                hint: "Total paid for the 3 months",
                manual: "campaign_investment",
                step: 100,
              })}
              {numField("Ongoing monthly investment (£)", "monthly", {
                hint: "Used for the 12-month figures",
                manual: "monthly_investment",
                step: 100,
              })}
            </div>

            <h2 style={{ margin: "28px 0 20px" }}>Campaign goals — from their onboarding form</h2>
            <div className="fields fields--stack">
              {(
                [
                  ["goal1", "Meetings each consultant sits per month"],
                  ["goal2", "Revenue expected from a new consultant in year one"],
                  ["goal3", "What success looks like to them"],
                ] as [ManualField, string][]
              ).map(([field, label]) => (
                <div className="field" key={field}>
                  <label htmlFor={`rn-${field}`}>{label}</label>
                  <textarea
                    id={`rn-${field}`}
                    rows={2}
                    placeholder="Paste their answer"
                    value={inputs[field] ?? ""}
                    onChange={(e) => setInput(field, e.target.value)}
                    onBlur={() => saveManual(field, field)}
                  />
                  {marker(field)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="scenarios">
          {scenarioCard(
            "a",
            "Completed",
            "The three months just finished",
            "Every figure below is a real event that already happened.",
            "card--actual",
          )}
          {scenarioCard(
            "b",
            "Next 12 months",
            "If we keep going at this rate",
            "The same monthly performance, carried across a further year.",
            "",
          )}
          {scenarioCard(
            "c",
            "Next 12 months · accounts worked",
            "If each account gives you one role a quarter",
            "The realistic floor for a client you service well — four roles a year, not one.",
            "card--lead",
          )}
        </section>

        <section className="rail">
          <h2>What you put in, against what comes back</h2>
          <p className="sub">Drawn to the same scale, so the blocks are directly comparable.</p>
          {barRow("a", "Three months completed", "Actual")}
          {barRow("b", "Next 12 months", `Current rate · ${effScenario.label.toLowerCase()}`)}
          {barRow("c", "Next 12 months, accounts worked", `One role per quarter · ${effScenario.label.toLowerCase()}`)}
          <div className="legend">
            <span>
              <i className="k-inv" />
              Your investment
            </span>
            <span>
              <i className="k-ret" />
              Potential placement fees
            </span>
          </div>
        </section>

        <section className="goals">
          <h2>Campaign goals</h2>
          <p className="sub">In your own words, from the onboarding form at the start of the campaign.</p>
          {goalBlock(
            "On average, how many new client sales meetings are each of your consultants sitting per month?",
            effInputs.goal1 ?? "",
          )}
          {goalBlock(
            "When bringing on a new consultant, how much revenue do you expect them to generate in their first year?",
            effInputs.goal2 ?? "",
          )}
          {goalBlock(
            "What does success look like to you — what result would you like us to achieve for you to renew at the end of your campaign?",
            effInputs.goal3 ?? "",
          )}
        </section>

        <p className="notes">
          <strong>How these numbers are built.</strong> {note}
        </p>

        {!presenting && (presentations?.length ?? 0) > 0 && (
          <section className="panel prep presentations" style={{ marginTop: 34, marginBottom: 0 }}>
            <h2>Past presentations</h2>
            <table>
              <thead>
                <tr>
                  <th>Presented</th>
                  <th>By</th>
                  <th>Case</th>
                  <th>ROI A</th>
                  <th>ROI B</th>
                  <th>ROI C</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(presentations ?? []).map((p) => {
                  const c = p.figures?.computed;
                  const roi = (k: "a" | "b" | "c") =>
                    c ? roiText(c[k].fees, c[k].investment) : "—";
                  return (
                    <tr key={p.id}>
                      <td>{format(new Date(p.presented_at), "d MMM yyyy, HH:mm")}</td>
                      <td>{presenterNames?.[p.presented_by] ?? "—"}</td>
                      <td>{scenarioByKey(p.scenario).label}</td>
                      <td className="fig">{roi("a")}</td>
                      <td className="fig">{roi("b")}</td>
                      <td className="fig">{roi("c")}</td>
                      <td>
                        {viewing?.id === p.id ? (
                          <button type="button" onClick={() => setViewing(null)}>
                            Live
                          </button>
                        ) : (
                          <button type="button" onClick={() => setViewing(p)}>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
};

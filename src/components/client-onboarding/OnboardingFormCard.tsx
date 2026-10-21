// The client's onboarding-form answers, shown on the client profile's
// Documents tab. Daniel's ruling (26 Aug): the full answers were eating the
// journey sheet, and Documents is where he'd look for them — so they live here,
// collapsed by default, and the journey sheet keeps only a summary.

import { useState } from "react";
import { ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useJourneyDetail } from "@/hooks/useClientOnboardingAdmin";

interface JourneyTaskLike {
  step_key: string;
  label: string;
  step_type: string;
  config: Record<string, unknown>;
  answers: Record<string, unknown> | null;
  is_completed: boolean;
}

const prettify = (key: string) =>
  key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Answers can be strings, arrays (tick boxes) or objects (full name / address). */
const toText = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(v);
};

const fileName = (p: string) => p.split("/").pop()?.replace(/^[a-z_]+-[a-z0-9]+-[a-z0-9]{4}-/, "") ?? p;

export function OnboardingFormCard({ clientId }: { clientId: string }) {
  const { data, isLoading } = useJourneyDetail(clientId);
  const [open, setOpen] = useState(true);

  if (isLoading) {
    return (
      <Card className="border-border shadow-card">
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading onboarding form…
        </CardContent>
      </Card>
    );
  }

  const stages = (data?.stages ?? []) as Array<{ tasks: JourneyTaskLike[] }>;
  const tasks = stages.flatMap((s) => s.tasks || []);
  const formTasks = tasks.filter((t) => t.step_type === "form" && t.answers);
  const listTasks = tasks.filter(
    (t) => (t.step_type === "text_list" || t.step_type === "upload" || t.step_type === "yes_no") && t.answers
  );
  const filesMulti = (data?.files_multi ?? {}) as Record<string, { path: string; url: string }[]>;

  // No journey, or the form isn't filled in yet — say nothing rather than
  // showing an empty shell on every client profile.
  if (formTasks.length === 0 && listTasks.length === 0) return null;

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-primary" />
            Onboarding form
          </CardTitle>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {open ? "Hide" : "Show"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-5 pt-0">
          {formTasks.map((t) => {
            const questions = ((t.config?.questions as Array<{ key: string; label: string; section?: string }>) ?? []);
            const answers = (t.answers ?? {}) as Record<string, unknown>;
            const rows = questions.length
              ? questions.map((q) => ({ label: q.label, section: q.section, value: answers[q.key] }))
              : Object.entries(answers).map(([k, v]) => ({ label: prettify(k), section: undefined, value: v }));
            let lastSection: string | undefined;
            return (
              <div key={t.step_key} className="space-y-3">
                {formTasks.length > 1 && <p className="text-sm font-semibold">{t.label}</p>}
                {rows.map((r, i) => {
                  const showSection = r.section && r.section !== lastSection;
                  lastSection = r.section ?? lastSection;
                  return (
                    <div key={i} className="space-y-0.5">
                      {showSection && (
                        <p className="text-[11px] font-mono uppercase tracking-wide text-primary pt-2">{r.section}</p>
                      )}
                      <p className="text-xs font-medium text-muted-foreground">{r.label}</p>
                      <p className="text-sm whitespace-pre-wrap">{toText(r.value).trim() || "—"}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {listTasks.length > 0 && (
            <div className="space-y-3 pt-1 border-t">
              {listTasks.map((t) => {
                const a = (t.answers ?? {}) as { items?: string[]; declined?: boolean; reason?: string; answer?: string; file_paths?: string[] };
                const files = filesMulti[t.step_key] ?? [];
                return (
                  <div key={t.step_key} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                      {t.label}
                      {(a.declined || a.answer === "no") && (
                        <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                          {a.answer === "no" ? "said no" : "nothing to add"}
                        </Badge>
                      )}
                    </p>
                    {a.declined || a.answer === "no" ? (
                      <p className="text-sm text-muted-foreground">
                        {a.reason ? `"${a.reason}"` : "The client confirmed they have nothing to share."}
                      </p>
                    ) : null}
                    {files.length > 0 && (
                      <ul className="text-sm space-y-0.5">
                        {files.map((f) => (
                          <li key={f.path}>
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{fileName(f.path)}</a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!a.declined && a.answer !== "no" && Array.isArray(a.items) && a.items.length > 0 ? (
                      <ul className="text-sm space-y-0.5">
                        {a.items.map((item, i) => (
                          <li key={i}>• {item}</li>
                        ))}
                      </ul>
                    ) : t.step_type === "upload" && files.length === 0 && !a.declined ? (
                      <p className="text-sm text-muted-foreground">Uploaded. Open it from the onboarding journey.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

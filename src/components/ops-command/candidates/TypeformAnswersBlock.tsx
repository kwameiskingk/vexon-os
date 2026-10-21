// The candidate's Typeform self-screening on the call-list card (11 Sep,
// Elena and Marcus: nobody is phone-screened any more; everyone fills the
// Typeform and Elena books the live call trial from the answers).
//
// Answers arrive one of two ways and are shown the same: as extra columns on
// her Typeform sheet import, or pulled from the lead's custom fields in the
// Human Resources Close org by pasting the Close lead link here. Pulling
// saves straight away (Elena: "I like everything to be immediate") and
// fills in email / phone / LinkedIn if the card had none.

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CvScreening } from "@/hooks/useCvScreenings";
import { useCloseLeadLookup, useSaveTypeformAnswers } from "@/hooks/useCloseLeadLookup";

export type ScreeningWithTypeform = CvScreening & {
  first_name?: string | null;
  last_name?: string | null;
  typeform_answers?: Record<string, string> | null;
  close_lead_id?: string | null;
  close_lead_url?: string | null;
};

export const typeformAnswersOf = (s: CvScreening): Record<string, string> => {
  const raw = (s as ScreeningWithTypeform).typeform_answers;
  return raw && typeof raw === "object" ? raw : {};
};

export function TypeformAnswersBlock({ screening }: { screening: CvScreening }) {
  const row = screening as ScreeningWithTypeform;
  const answers = typeformAnswersOf(screening);
  const entries = Object.entries(answers);
  const [link, setLink] = useState(row.close_lead_url ?? "");
  const lookup = useCloseLeadLookup();
  const save = useSaveTypeformAnswers();
  const busy = lookup.isPending || save.isPending;

  const pull = async () => {
    const value = link.trim();
    if (!value) return;
    try {
      const result = await lookup.mutateAsync(value);
      // 11 Sep: a link pasted on the wrong card put Tristan Lester's details
      // on Tristan Sykes. If the lead's name shares no word with this card's
      // name, say so and ask before anything is written.
      const words = (n: string | null | undefined) => new Set((n ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1));
      const cardWords = words(screening.full_name);
      const leadWords = words(result.contact_name ?? result.company_name);
      const overlap = [...leadWords].some((w) => cardWords.has(w));
      if (leadWords.size > 0 && !overlap) {
        const ok = window.confirm(
          `This Close lead is "${result.contact_name ?? result.company_name}", but this card is ${screening.full_name}. Attach it anyway?`,
        );
        if (!ok) return;
      }
      const count = Object.keys(result.answers).length;
      await save.mutateAsync({
        cvScreeningId: screening.id,
        answers: result.answers,
        closeLeadId: result.lead_id,
        closeLeadUrl: result.lead_url,
        email: result.email,
        phone: result.phone,
        linkedinUrl: result.linkedin_url,
      });
      toast.success(count > 0 ? `Pulled ${count} answer${count === 1 ? "" : "s"} from Close` : "Lead found, but it has no custom-field answers yet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Close lookup failed");
    }
  };

  return (
    <div className="rounded-md border border-violet-500/30 bg-violet-500/[0.05] px-3 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Typeform answers</p>
        {row.close_lead_url && (
          <a href={row.close_lead_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Open in Close <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="close-lead-link" className="text-xs text-muted-foreground">Close lead link</Label>
        <div className="flex gap-2">
          <Input
            id="close-lead-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void pull(); } }}
            placeholder="https://app.close.com/lead/lead_…/"
            className="h-8 text-sm bg-background"
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" disabled={!link.trim() || busy} onClick={pull}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {entries.length > 0 ? "Refresh from Close" : "Pull from Close"}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No answers on this card yet. Paste the candidate&apos;s Close lead link and pull them, or import them as columns on the Typeform sheet.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {entries.map(([label, value]) => (
            <div key={label} className="text-sm">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-foreground break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

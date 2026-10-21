// CSV import for the TA Call List (17 Aug consolidation).
//
// Typeform and Headhunting no longer have their own tabs — candidates from
// any channel arrive here as a CSV. Each accepted row becomes a cv_screenings
// row (bucket SHORTLIST, review_status to_call, ingested_via 'sheet_import'),
// so an imported candidate is opened, screened, and booked through exactly
// the same modal and promote path as agent-screened CVs. The row's declared
// source travels in flags ('source:<value>') and is copied to
// candidates.source at booking.
//
// Dedupe: a row whose email matches an existing screening links to it rather
// than duplicating — source=screening_tool matches are reported as "linked",
// other sources as "already in the list"; either way no second card is
// created. Rows repeated within the file are skipped too. Nothing is ever
// rejected for an unrecognised source: it is stored as given and flagged.
//
// Fail-soft: the whole import is disabled with a notice until
// candidates.source exists (docs/pending-migrations/2026-08-17-candidate-source.sql),
// so no import can ever produce bookings whose origin would be silently lost.
//
// Deliberately no Close CRM push — getting candidates into Close stays a
// manual step (17 Aug ruling).

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CV_SCREENINGS_QUERY_KEY, type CvScreening } from "@/hooks/useCvScreenings";
import { useCandidateSourceColumn } from "@/hooks/useCandidateSourceColumn";
import {
  normaliseSource,
  sourceLabel,
  SOURCE_FLAG_PREFIX,
  UNRECOGNISED_SOURCE_FLAG,
  type NormalisedSource,
} from "@/lib/candidateSource";

// Header aliases — headers are lowercased/trimmed with spaces and dashes
// collapsed to underscores before this lookup, so "Current Title" and
// "current-title" both land on current_title without an alias entry.
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  full_name: "name",
  candidate: "name",
  candidate_name: "name",
  first_name: "first_name",
  firstname: "first_name",
  first: "first_name",
  forename: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  close_lead_link: "close_lead_url",
  close_link: "close_lead_url",
  close_lead_url: "close_lead_url",
  close_url: "close_lead_url",
  email: "email",
  email_address: "email",
  e_mail: "email",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  mobile_phone: "phone",
  telephone: "phone",
  current_title: "current_title",
  title: "current_title",
  job_title: "current_title",
  role: "current_title",
  company: "company",
  current_company: "company",
  employer: "company",
  profile_url: "profile_url",
  linkedin: "profile_url",
  linkedin_url: "profile_url",
  linkedin_profile_url: "profile_url",
  linkedin_profile: "profile_url",
  profile: "profile_url",
  url: "profile_url",
  source: "source",
  channel: "source",
  origin: "source",
};

type RowStatus = "new" | "linked" | "duplicate" | "no_name";

interface ParsedRow {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  closeLeadUrl: string;
  /** Every column the importer does not recognise (Typeform's questions), label → answer. */
  answers: Record<string, string>;
  phone: string;
  title: string;
  company: string;
  profileUrl: string;
  source: NormalisedSource;
  status: RowStatus;
  /** Short human note shown in the preview's status column. */
  note: string | null;
}

const STATUS_BADGE: Record<RowStatus, { label: string; classes: string }> = {
  new: { label: "Will import", classes: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  linked: { label: "Linked", classes: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  duplicate: { label: "Skipped", classes: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  no_name: { label: "Skipped", classes: "bg-red-500/10 text-red-600/90 dark:text-red-400/90" },
};

const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

const cell = (record: Record<string, string>, field: string): string => {
  for (const [rawKey, value] of Object.entries(record)) {
    if (HEADER_ALIASES[rawKey] === field) return (value ?? "").trim();
  }
  return "";
};

// Elena's Typeform sheet carries every question as its own column (11 Sep).
// Anything the importer does not recognise is kept, label → answer, so the
// card shows the self-screening without a second step. Papa normalises the
// headers; the original spelling is recovered from the raw header list.
const extraColumns = (record: Record<string, string>, rawHeaders: Map<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (HEADER_ALIASES[key]) continue;
    const v = (value ?? "").trim();
    if (!v) continue;
    out[rawHeaders.get(key) ?? key] = v;
  }
  return out;
};

// Which source every row gets: the file's own column, or one picked here.
const SOURCE_MODES = [
  { value: "column", label: "From the file's Source column" },
  { value: "typeform", label: "Typeform (job-board applicants)" },
  { value: "headhunt", label: "Headhunted" },
  { value: "commission_only", label: "Commission only" },
] as const;
type SourceMode = (typeof SOURCE_MODES)[number]["value"];

/** yyyy-mm-dd for screened_on (a date column). */
const todayIso = () => new Date().toISOString().slice(0, 10);

const fileSlug = (name: string) =>
  name.toLowerCase().replace(/\.csv$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
  "import";

export function CallListCsvImport({ screenings }: { screenings: CvScreening[] }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("column");
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const sourceColumn = useCandidateSourceColumn();

  // Existing screenings by lowercased email, for the link-don't-duplicate rule.
  const existingByEmail = useMemo(() => {
    const map = new Map<string, CvScreening>();
    for (const s of screenings) {
      const email = (s.email ?? "").trim().toLowerCase();
      if (email && !map.has(email)) map.set(email, s);
    }
    return map;
  }, [screenings]);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setParseError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = (file: File) => {
    setParseError(null);
    const rawHeaders = new Map<string, string>();
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => {
        const key = normaliseHeader(h);
        if (!rawHeaders.has(key)) rawHeaders.set(key, h.trim());
        return key;
      },
      complete: (result) => {
        if (result.data.length === 0) {
          setParseError("The file has no data rows.");
          setFileName(file.name);
          setRows([]);
          return;
        }
        const seenInFile = new Set<string>();
        const parsed: ParsedRow[] = result.data.map((record) => {
          const firstName = cell(record, "first_name");
          const lastName = cell(record, "last_name");
          const name = cell(record, "name") || [firstName, lastName].filter(Boolean).join(" ");
          const email = cell(record, "email");
          const source = sourceMode === "column" ? normaliseSource(cell(record, "source")) : normaliseSource(sourceMode);
          const row: ParsedRow = {
            name,
            firstName,
            lastName,
            email,
            closeLeadUrl: cell(record, "close_lead_url"),
            answers: extraColumns(record, rawHeaders),
            phone: cell(record, "phone"),
            title: cell(record, "current_title"),
            company: cell(record, "company"),
            profileUrl: cell(record, "profile_url"),
            source,
            status: "new",
            note: null,
          };
          if (!name) {
            return { ...row, status: "no_name", note: "No name on the row" };
          }
          const emailKey = email.toLowerCase();
          if (emailKey) {
            if (seenInFile.has(emailKey)) {
              return { ...row, status: "duplicate", note: "Repeated in this file" };
            }
            seenInFile.add(emailKey);
            if (existingByEmail.has(emailKey)) {
              return source.value === "screening_tool"
                ? { ...row, status: "linked", note: "Already screened — linked, not duplicated" }
                : { ...row, status: "duplicate", note: "Email already in the list" };
            }
          }
          if (!source.recognised) {
            return { ...row, note: `Unrecognised source “${source.value}” — kept as given` };
          }
          if (source.defaulted) {
            return { ...row, note: "No source given — defaulted to headhunt" };
          }
          return row;
        });
        setFileName(file.name);
        setRows(parsed);
      },
      error: (err) => {
        setParseError(`Couldn't read the file: ${err.message}`);
        setFileName(file.name);
        setRows([]);
      },
    });
  };

  const importable = rows.filter((r) => r.status === "new");
  const linkedCount = rows.filter((r) => r.status === "linked").length;
  const skippedCount = rows.filter((r) => r.status === "duplicate" || r.status === "no_name").length;
  const flaggedCount = importable.filter((r) => !r.source.recognised).length;

  const doImport = useMutation({
    mutationFn: async () => {
      const stamp = Date.now();
      const base = fileSlug(fileName ?? "import");
      const payload = importable.map((r, i) => ({
        full_name: r.name,
        first_name: r.firstName || null,
        last_name: r.lastName || null,
        typeform_answers: Object.keys(r.answers).length > 0 ? r.answers : null,
        close_lead_url: r.closeLeadUrl || null,
        email: r.email || null,
        phone: r.phone || null,
        current_title: r.title || null,
        current_company: r.company || null,
        linkedin_url: r.profileUrl || null,
        bucket: "SHORTLIST",
        review_status: "to_call",
        screened_on: todayIso(),
        ingested_via: "sheet_import",
        source_file: fileName ?? "csv-import",
        source_file_slug: `csv-${base}-${stamp}-${i}`,
        flags: [
          `${SOURCE_FLAG_PREFIX}${r.source.value}`,
          ...(r.source.recognised ? [] : [UNRECOGNISED_SOURCE_FLAG]),
        ],
      }));
      const { error } = await supabase.from("cv_screenings").insert(payload as never);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
      toast.success(
        `Imported ${count} candidate${count === 1 ? "" : "s"} — they're at the top of the Call List`,
      );
      setOpen(false);
      reset();
    },
    onError: (err) => {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    },
  });

  return (
    <>
      <Button
        variant="outline"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Upload className="h-4 w-4" />
        Import CSV
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import candidates from CSV</DialogTitle>
            <DialogDescription>
              Elena&apos;s sheets as they are: First Name, Last Name, Email Address, Phone Number,
              Current Title, Current Company, LinkedIn Profile URL, Source. Any other column (the
              Typeform questions) is kept on the card as the candidate&apos;s answers. Header spelling
              is forgiving. Nothing is pushed to Close.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="csv-source-mode">Treat every row as</label>
            <select
              id="csv-source-mode"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-80"
              value={sourceMode}
              onChange={(e) => {
                setSourceMode(e.target.value as SourceMode);
                if (fileInput.current?.files?.[0]) handleFile(fileInput.current.files[0]);
              }}
            >
              {SOURCE_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {!sourceColumn.applied ? (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                {sourceColumn.loading
                  ? "Checking the database…"
                  : (
                    <>
                      CSV import is disabled until the candidate-source migration
                      has been run. Run{" "}
                      <code className="text-xs">docs/pending-migrations/2026-08-17-candidate-source.sql</code>{" "}
                      in the hosted SQL editor, then reopen this dialog.
                    </>
                  )}
              </p>
            </div>
          ) : rows.length === 0 && !parseError ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <FileUp className="h-6 w-6" />
              Choose a .csv file
            </button>
          ) : parseError ? (
            <div className="space-y-3">
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-foreground">
                {parseError}
              </p>
              <Button variant="outline" size="sm" onClick={reset}>
                Try another file
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-foreground">{fileName}</span>
                <span className="text-muted-foreground">
                  {rows.length} row{rows.length === 1 ? "" : "s"} ·{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {importable.length} to import
                  </span>
                  {linkedCount > 0 && <> · {linkedCount} linked</>}
                  {skippedCount > 0 && <> · {skippedCount} skipped</>}
                  {flaggedCount > 0 && (
                    <>
                      {" "}
                      · <span className="text-amber-600 dark:text-amber-400">{flaggedCount} flagged</span>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Choose another file
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Email</th>
                      <th className="px-3 py-1.5 font-medium">Source</th>
                      <th className="px-3 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r, i) => (
                      <tr key={i} className={cn(r.status !== "new" && "opacity-70")}>
                        <td className="px-3 py-1.5">
                          <p className="font-medium text-foreground">{r.name || "—"}</p>
                          {(r.title || r.company) && (
                            <p className="truncate text-xs text-muted-foreground">
                              {[r.title, r.company].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.email || "—"}</td>
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-px text-[11px] font-medium",
                              r.source.recognised
                                ? "bg-muted text-muted-foreground"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {sourceLabel(r.source.value)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-px text-[11px] font-medium",
                              STATUS_BADGE[r.status].classes,
                            )}
                          >
                            {STATUS_BADGE[r.status].label}
                          </span>
                          {r.note && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{r.note}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!sourceColumn.applied || importable.length === 0 || doImport.isPending}
              onClick={() => doImport.mutate()}
            >
              {doImport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {importable.length > 0 ? importable.length : ""} candidate
              {importable.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Single-candidate add for the Call List (Elena, SDR onboarding call 2 Sep
// 21:55: "can I add just one candidate, not an import?").
//
// Writes exactly the row the CSV import writes — bucket SHORTLIST,
// review_status to_call — so the person is opened, screened and booked
// through the same modal and promote path. Provenance: cv_screenings.ingested_via
// is CHECK-constrained to 'agent' | 'sheet_import' (migration 20260807120000),
// so a manual add rides 'sheet_import' with source_file 'manual-add' to stay
// distinguishable. Same email de-dupe rule as the import (an existing
// screening with that email blocks a second card). Same fail-soft gate on
// the candidate-source migration so origin is never silently lost.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CV_SCREENINGS_QUERY_KEY, type CvScreening } from "@/hooks/useCvScreenings";
import { useCandidateSourceColumn } from "@/hooks/useCandidateSourceColumn";
import {
  DEFAULT_SOURCE,
  KNOWN_SOURCES,
  SOURCE_FLAG_PREFIX,
  sourceLabel,
  type KnownSource,
} from "@/lib/candidateSource";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  profileUrl: string;
  source: KnownSource;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  title: "",
  company: "",
  profileUrl: "",
  source: DEFAULT_SOURCE,
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function AddCandidateDialog({ screenings }: { screenings: CvScreening[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const queryClient = useQueryClient();
  const sourceColumn = useCandidateSourceColumn();

  const existingEmails = useMemo(() => {
    const set = new Set<string>();
    for (const s of screenings) {
      const email = (s.email ?? "").trim().toLowerCase();
      if (email) set.add(email);
    }
    return set;
  }, [screenings]);

  const emailKey = form.email.trim().toLowerCase();
  const duplicate = !!emailKey && existingEmails.has(emailKey);
  const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
  const canSave = form.firstName.trim().length > 0 && !duplicate && sourceColumn.applied;

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const stamp = Date.now();
      const payload = {
        full_name: fullName,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        current_title: form.title.trim() || null,
        current_company: form.company.trim() || null,
        linkedin_url: form.profileUrl.trim() || null,
        bucket: "SHORTLIST",
        review_status: "to_call",
        screened_on: todayIso(),
        ingested_via: "sheet_import",
        source_file: "manual-add",
        source_file_slug: `manual-${stamp}`,
        flags: [`${SOURCE_FLAG_PREFIX}${form.source}`],
      };
      const { error } = await supabase.from("cv_screenings").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CV_SCREENINGS_QUERY_KEY });
      toast.success(`${fullName} added to the top of the Call List`);
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (err) => {
      // Supabase errors are plain objects, not Error instances — read .message directly.
      const msg = (err as { message?: string } | null)?.message || "unknown error";
      toast.error(`Couldn't add candidate: ${msg}`);
    },
  });

  return (
    <>
      <Button className="gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add candidate
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setForm(EMPTY);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a candidate</DialogTitle>
            <DialogDescription>
              One person, straight onto the Call List as "to call". Same fields as
              the CSV import. Nothing is pushed to Close.
            </DialogDescription>
          </DialogHeader>

          {!sourceColumn.applied && !sourceColumn.loading && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-foreground">
                Adding candidates is disabled until the candidate-source migration has been run.
              </p>
            </div>
          )}

          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ac-first">First name *</Label>
                <Input id="ac-first" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-last">Last name</Label>
                <Input id="ac-last" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ac-email">Email</Label>
                <Input
                  id="ac-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                  className={duplicate ? "border-amber-500" : undefined}
                />
                {duplicate && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Already on the Call List — open that card instead.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-phone">Phone</Label>
                <Input id="ac-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-title">Current title</Label>
                <Input id="ac-title" value={form.title} onChange={(e) => set("title")(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ac-company">Company</Label>
                <Input id="ac-company" value={form.company} onChange={(e) => set("company")(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ac-url">LinkedIn / profile URL</Label>
              <Input id="ac-url" value={form.profileUrl} onChange={(e) => set("profileUrl")(e.target.value)} placeholder="https://linkedin.com/in/…" />
            </div>
            <div className="grid gap-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => set("source")(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sourceLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()} className="gap-1.5">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Call List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

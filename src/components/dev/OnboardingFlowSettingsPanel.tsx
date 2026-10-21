// New-starter flow · the things that are not a card (11 Sep, Marcus's 8 Sep
// call): the "Before you start is complete" screen a starter sees while day
// one is still locked (their day-one itinerary and who to contact), and the
// closing video that plays before the finish card. Lives in
// onboarding_flow_settings (one row); saving is immediate.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaFields } from "@/components/onboarding-deck/MediaFields";
import { useAuth } from "@/contexts/AuthContext";
import {
  ONBOARDING_FLOW_SETTINGS_KEY,
  saveOnboardingFlowSettings,
  useOnboardingFlowSettings,
  type OnboardingFlowSettings,
} from "@/hooks/useOnboardingFlowSettings";

export function OnboardingFlowSettingsPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useOnboardingFlowSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", contactName: "", contactEmail: "" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data || dirty) return;
    setDraft({
      title: data.pre_start_end_title,
      body: data.pre_start_end_body,
      contactName: data.contact_name ?? "",
      contactEmail: data.contact_email ?? "",
    });
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: (patch: Partial<OnboardingFlowSettings>) => saveOnboardingFlowSettings(patch, user?.id),
    onSuccess: () => {
      toast.success("Saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ONBOARDING_FLOW_SETTINGS_KEY });
    },
    onError: (e: Error) =>
      toast.error(
        /onboarding_flow_settings/.test(e.message)
          ? "Run migration 20260911140000_sdr_onboarding_structure.sql first"
          : e.message,
      ),
  });

  const hasVideo = !!(data?.finish_video_path || data?.finish_video_url);
  const set = (k: keyof typeof draft, v: string) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  return (
    <div className="dc-surface">
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-medium flex-1 text-[var(--dc-text)]">Section end &amp; closing video</span>
        <span className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
          {isLoading ? "…" : hasVideo ? "Closing video attached" : "No closing video yet"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--dc-line)] pt-3">
          <div className="space-y-3">
            <p className="text-xs text-[var(--dc-text-dim)]">
              What a starter sees once every &ldquo;Before you start&rdquo; card is done and day one has not been
              released yet: their day-one itinerary and who to contact. Blank lines separate paragraphs; a line
              beginning with &ldquo;•&rdquo; reads as a list.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-[var(--dc-text-dim)]">Title</label>
                <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="You are ready for day one." />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-[var(--dc-text-dim)]">Day-one itinerary and anything else they should know</label>
                <Textarea rows={9} value={draft.body} onChange={(e) => set("body", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--dc-text-dim)]">Contact name</label>
                <Input value={draft.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Elena" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--dc-text-dim)]">Contact email</label>
                <Input type="email" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="elena@meridiansales.example" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!dirty || save.isPending || !draft.title.trim()}
                onClick={() =>
                  save.mutate({
                    pre_start_end_title: draft.title.trim(),
                    pre_start_end_body: draft.body.trim(),
                    contact_name: draft.contactName.trim() || null,
                    contact_email: draft.contactEmail.trim() || null,
                  })
                }
              >
                Save section-end screen
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[var(--dc-text-dim)]">
              The closing video (Marcus&apos;s send-off) plays as a card once every day-one card is complete, before
              the &ldquo;You are all set&rdquo; screen. Saving is immediate.
            </p>
            <MediaFields
              value={{
                thumbnailPath: data?.finish_thumbnail_path ?? "",
                videoPath: data?.finish_video_path ?? "",
                videoUrl: data?.finish_video_url ?? "",
              }}
              onChange={(patch) =>
                save.mutate({
                  ...(patch.thumbnailPath !== undefined ? { finish_thumbnail_path: patch.thumbnailPath || null } : {}),
                  ...(patch.videoPath !== undefined ? { finish_video_path: patch.videoPath || null } : {}),
                  ...(patch.videoUrl !== undefined ? { finish_video_url: patch.videoUrl || null } : {}),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Enquire (Vexon OS Forms) - the list. Create, open the builder, copy the link, see counts.
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { EnquireHead } from "@/components/forms/EnquireHead";
import { useEnquireNav } from "@/lib/forms/enquireNav";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateForm, useDeleteForm, useDuplicateForm, useForms, useResponseCounts } from "@/hooks/useForms";
import { slugify, type FormKind } from "@/lib/forms/schema";

export const formPublicUrl = (slug: string) => `${window.location.origin}/f/${slug}`;

const KIND_LABEL: Record<FormKind, string> = { lead: "Lead form", hiring: "Hiring form", general: "General" };

export default function FormsPage() {
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <FormsListBody />
      </PageContainer>
    </DashboardLayout>
  );
}

/** The list itself: on the page above and inside the Dev Centre. */
export function FormsListBody() {
  const go = useEnquireNav();
  const { data: forms = [], isLoading } = useForms();
  const { data: counts = {} } = useResponseCounts();
  const create = useCreateForm();
  const del = useDeleteForm();
  const dup = useDuplicateForm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<FormKind>("general");

  const doCreate = async () => {
    if (!name.trim()) return;
    try {
      const f = await create.mutateAsync({ name: name.trim(), slug: slug || slugify(name), kind });
      setOpen(false); setName(""); setSlug("");
      go({ view: "editor", id: f.id });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the form"); }
  };

  return (
    <>
        <EnquireHead
          title="Enquire"
          subtitle="Meridian's own Typeform. Build a form, share the link or embed it, score the answers, and they land where the team already works."
          actions={<ButtonV2 variant="primary" onClick={() => setOpen(true)}>New form</ButtonV2>}
        />

        {isLoading ? <p className="py-8 text-center text-[12px] text-[var(--dim)]">Loading…</p> : forms.length === 0 ? (
          <p className="border-t border-[var(--line)] py-10 text-center text-[12px] text-[var(--dim)]">No forms yet. Run the Forms migration if this looks wrong.</p>
        ) : (
          <Panel title="Forms" aside={<Pill>{forms.length}</Pill>}>
            <RowList columns="minmax(220px,1.5fr) 90px 110px auto">
              {forms.map((f) => (
                <Row key={f.id} onClick={() => go({ view: "editor", id: f.id })}>
                  <RowName primary={f.name} secondary={`/f/${f.slug} · ${KIND_LABEL[f.kind]} · updated ${formatDistanceToNow(new Date(f.updated_at), { addSuffix: true })}`} />
                  <div><Pill variant={f.status === "live" ? "ok" : f.status === "closed" ? "default" : "warn"}>{f.status === "live" ? "Live" : f.status === "closed" ? "Closed" : "Draft"}</Pill></div>
                  <RowNum className="text-left"><button type="button" className="hover:text-[var(--accent)]" onClick={(e) => { e.stopPropagation(); go({ view: "responses", id: f.id }); }}>{counts[f.id] ?? 0} responses</button></RowNum>
                  <div className="flex items-center gap-[5px]" onClick={(e) => e.stopPropagation()}>
                    <ButtonV2 size="sm" onClick={() => { navigator.clipboard.writeText(formPublicUrl(f.slug)); toast.success("Link copied"); }}>Copy link</ButtonV2>
                    <ButtonV2 size="sm" onClick={() => window.open(`/f/${f.slug}${f.status === "live" ? "" : "?draft=1"}`, "_blank", "noopener")}>Open</ButtonV2>
                    <ButtonV2 size="sm" onClick={async () => { try { const c = await dup.mutateAsync(f); toast.success(`Copied as "${c.name}" (draft)`); go({ view: "editor", id: c.id }); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't duplicate"); } }}>Duplicate</ButtonV2>
                    <ButtonV2 size="sm" variant="ghost" className="text-[var(--bad)]" onClick={() => { if (confirm(`Delete "${f.name}" and all its responses?`)) del.mutate(f.id); }}>Delete</ButtonV2>
                  </div>
                </Row>
              ))}
            </RowList>
          </Panel>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New form</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="e.g. Setter application" autoFocus /></div>
            <div className="space-y-1"><Label>Link</Label><div className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">/f/</span><Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></div></div>
            <div className="space-y-1"><Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FormKind)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="lead">Lead form → Marketing Leads</SelectItem><SelectItem value="hiring">Hiring form → Talent Acquisition</SelectItem><SelectItem value="general">General → this form's responses only</SelectItem></SelectContent></Select>
            </div>
          </div>
          <DialogFooter><ButtonV2 onClick={() => setOpen(false)}>Cancel</ButtonV2><ButtonV2 variant="primary" onClick={doCreate} disabled={create.isPending || !name.trim()}>Create</ButtonV2></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

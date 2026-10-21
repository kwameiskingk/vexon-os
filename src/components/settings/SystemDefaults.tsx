// Client contact (rebuilt 15 Oct 2026). The only system_settings fields
// anything reads are the CSM name, email and phone, shown to every client in
// their Communications tab. Company name, sender name, timezone, currency,
// logo, brand colour and the Calendly URL were read by nothing and are gone
// from the form (the columns stay; the admin-system-settings function only
// updates the keys it is sent). A Kronos booking link for the client's
// Communications tab belongs to the public-facing session.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ButtonV2, Panel } from "@/components/ui-v2";

type Contact = { csm_name: string; csm_email: string; csm_phone: string };
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-system-settings`;

export const SystemDefaults = () => {
  const [saved, setSaved] = useState<Contact | null>(null);
  const [form, setForm] = useState<Contact>({ csm_name: "", csm_email: "", csm_phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(FN, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not load settings");
        const c: Contact = { csm_name: body.settings?.csm_name ?? "", csm_email: body.settings?.csm_email ?? "", csm_phone: body.settings?.csm_phone ?? "" };
        setSaved(c); setForm(c);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty = !!saved && (saved.csm_name !== form.csm_name || saved.csm_email !== form.csm_email || saved.csm_phone !== form.csm_phone);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const res = await fetch(FN, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ csm_name: form.csm_name.trim(), csm_email: form.csm_email.trim(), csm_phone: form.csm_phone.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save");
      setSaved({ ...form });
      toast.success("Client contact saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Client contact" meta="Shown to every client in their Communications tab as the person to reach" aside={<ButtonV2 size="sm" variant="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</ButtonV2>}>
      {loading ? <p className="py-4 text-[12px] text-[var(--dim)]">Loading…</p> : (
        <div className="grid gap-4 pt-3 md:grid-cols-3">
          <label className="block"><span className="dc-label">Name</span><input className="dc-input" value={form.csm_name} onChange={(e) => setForm({ ...form, csm_name: e.target.value })} placeholder="Daniel" /></label>
          <label className="block"><span className="dc-label">Email</span><input type="email" className="dc-input" value={form.csm_email} onChange={(e) => setForm({ ...form, csm_email: e.target.value })} placeholder="daniel@meridiansales.example" /></label>
          <label className="block"><span className="dc-label">Phone</span><input className="dc-input" value={form.csm_phone} onChange={(e) => setForm({ ...form, csm_phone: e.target.value })} placeholder="+44 …" /></label>
        </div>
      )}
    </Panel>
  );
};

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Save } from "lucide-react";

interface Props { employee: any }

const FIELDS: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "bank_name", label: "Bank Name", placeholder: "e.g. Barclays" },
  { key: "account_holder_name", label: "Account Holder Name" },
  { key: "account_number", label: "Account Number" },
  { key: "sort_code", label: "Sort Code (UK)", placeholder: "e.g. 12-34-56" },
  { key: "iban", label: "IBAN", placeholder: "International" },
  { key: "swift_bic", label: "SWIFT / BIC" },
  { key: "bank_country", label: "Bank Country" },
];

export function PayrollDetailsSection({ employee }: Props) {
  const queryClient = useQueryClient();
  const setterId = employee?.setterId as string | undefined;
  const sp = employee?.setterProfile ?? {};

  const [form, setForm] = useState({
    currency: sp.currency || "USD",
    home_address: sp.home_address || "",
    bank_name: sp.bank_name || "",
    account_holder_name: sp.account_holder_name || "",
    account_number: sp.account_number || "",
    sort_code: sp.sort_code || "",
    iban: sp.iban || "",
    swift_bic: sp.swift_bic || "",
    bank_country: sp.bank_country || "",
    bank_address: sp.bank_address || "",
  });

  useEffect(() => {
    setForm({
      currency: sp.currency || "USD",
      home_address: sp.home_address || "",
      bank_name: sp.bank_name || "",
      account_holder_name: sp.account_holder_name || "",
      account_number: sp.account_number || "",
      sort_code: sp.sort_code || "",
      iban: sp.iban || "",
      swift_bic: sp.swift_bic || "",
      bank_country: sp.bank_country || "",
      bank_address: sp.bank_address || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setterId, sp.currency, sp.account_number]);

  const save = useMutation({
    mutationFn: async () => {
      if (!setterId) throw new Error("This employee has no setter profile yet.");
      const { error } = await supabase
        .from("setters_profiles")
        .update(form)
        .eq("id", setterId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payroll details saved");
      queryClient.invalidateQueries({ queryKey: ["employee-profile", employee.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  if (!setterId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          Currency, Address &amp; Banking Details
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Used when invoices are compiled and paid out. Only filled fields appear on the payout summary.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Pay Currency *</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="GBP">GBP — Pound Sterling</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              All commission, bonuses and totals for this employee will display in this currency.
            </p>
          </div>
          <div>
            <Label>Home Address</Label>
            <Textarea
              value={form.home_address}
              onChange={(e) => setForm({ ...form, home_address: e.target.value })}
              rows={2}
              placeholder="Street, City, Postal Code, Country"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                value={(form as any)[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Label>Bank Address</Label>
            <Textarea
              value={form.bank_address}
              onChange={(e) => setForm({ ...form, bank_address: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {save.isPending ? "Saving…" : "Save Payroll Details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

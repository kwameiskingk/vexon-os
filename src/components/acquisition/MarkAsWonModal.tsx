import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trophy, PoundSterling } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { generateAllTasksForClient } from "@/lib/onboardingStages";

interface MarkAsWonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pitchCall: {
    id: string;
    client_name: string;
    client_email: string;
    company_name: string | null;
    contract_value: number | null;
    contract_term: string | null;
    discovery_log_id: string | null;
  } | null;
  onSuccess: () => void;
}

export function MarkAsWonModal({ open, onOpenChange, pitchCall, onSuccess }: MarkAsWonModalProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [contractTerm, setContractTerm] = useState("");
  const [isPif, setIsPif] = useState(false);
  const [pifAmount, setPifAmount] = useState("");
  const [firstPayment, setFirstPayment] = useState("");
  const [specialAgreements, setSpecialAgreements] = useState("");
  const [cashExVat, setCashExVat] = useState("");

  useEffect(() => {
    if (pitchCall && open) {
      setCompanyName(pitchCall.company_name || pitchCall.client_name || "");
      setContactName(pitchCall.client_name || "");
      setEmail(pitchCall.client_email || "");
      setMobile("");
      setContractValue(pitchCall.contract_value?.toString() || "");
      setContractTerm(pitchCall.contract_term || "");
      setIsPif(false);
      setPifAmount("");
      setFirstPayment("");
      setSpecialAgreements("");
      setCashExVat("");
    }
  }, [pitchCall, open]);

  // Keep PIF amount in sync with contract value when toggled on
  useEffect(() => {
    if (isPif && !pifAmount && contractValue) setPifAmount(contractValue);
  }, [isPif, contractValue, pifAmount]);

  const termMonths = (term: string): number => {
    const m = term.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  };

  const handleMarkAsWon = async () => {
    if (!pitchCall || !companyName.trim() || !contactName.trim() || !email.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!contractValue || parseFloat(contractValue) <= 0) {
      toast.error("Contract value is required");
      return;
    }
    if (!contractTerm) {
      toast.error("Contract term is required");
      return;
    }
    if (isPif && (!pifAmount || parseFloat(pifAmount) <= 0)) {
      toast.error("PIF amount is required when paid in full");
      return;
    }

    setIsSubmitting(true);
    try {
      const cv = parseFloat(contractValue);
      const pif = isPif ? parseFloat(pifAmount) : 0;
      const initial = isPif ? pif : (firstPayment ? parseFloat(firstPayment) : 0);

      // 1. Create client profile — 'pending' until onboarding is completed
      // on the board, which is when the client becomes visible in the
      // Clients tab and Client Health.
      const { data: clientProfile, error: profileError } = await supabase
        .from("client_profiles")
        .insert([{
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          phone: mobile.trim() || null,
          contract_value: cv,
          status: 'pending',
        }])
        .select()
        .single();

      if (profileError) throw profileError;

      // Guarded separately so the close still succeeds before the
      // contract_term migration is applied.
      const { error: termError } = await supabase
        .from('client_profiles')
        .update({ contract_term: contractTerm })
        .eq('id', clientProfile.id);
      if (termError) {
        console.error('contract_term not saved (migration pending?):', termError);
        toast.warning('Client saved, but the contract term could not be stored on the profile yet.');
      }

      // 2. Create onboarding entry
      const { data: stageRecord, error: stageError } = await supabase
        .from('client_onboarding_stages' as any)
        .insert({
          client_profile_id: clientProfile.id,
          current_stage: 1,
          source: 'deal_won',
        } as any)
        .select()
        .single();

      if (stageError) throw stageError;

      const stageData = stageRecord as any;
      const allTasks = generateAllTasksForClient();
      const taskRecords = allTasks.map(task => ({
        client_onboarding_id: stageData.id,
        stage: task.stage,
        task_key: task.task_key,
        task_label: task.task_label,
        is_completed: false,
      }));

      await supabase
        .from('client_onboarding_tasks' as any)
        .insert(taskRecords as any);

      // 3. Mark pitch_call as converted + record PIF/special agreements
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('pitch_calls')
        .update({
          converted_to_client: true,
          client_profile_id: clientProfile.id,
          contract_value: cv,
          contract_term: contractTerm,
          is_pif: isPif,
          pif_amount: isPif ? pif : null,
          special_agreements: specialAgreements.trim() || null,
          cash_collected_ex_vat: cashExVat ? parseFloat(cashExVat) : null,
          closed_on: new Date().toISOString().slice(0, 10),
          status: 'completed',
        } as any)
        .eq('id', pitchCall.id);

      // 4. First payment row (PIF amount OR deposit)
      if (initial > 0 && user?.id) {
        await supabase.from('ae_deal_payments' as any).insert({
          pitch_call_id: pitchCall.id,
          ae_user_id: user.id,
          amount: initial,
          paid_on: new Date().toISOString().slice(0, 10),
          installment_index: 1,
          note: isPif ? 'Paid in full at close' : 'Initial payment at close',
          auto_generated: false,
          created_by: user.id,
        } as any);

        // 4b. Mirror into client_payments so the CEO cash-collected feed sees it.
        // Failure here MUST surface — otherwise cash goals would silently miss it.
        const { error: cpError } = await supabase
          .from('client_payments')
          .insert([{
            ae_user_id: user.id,
            client_profile_id: clientProfile.id,
            pitch_call_id: pitchCall.id,
            amount: initial,
            payment_date: new Date().toISOString().slice(0, 10),
            status: 'received',
            created_by: user.id,
          } as any]);
        if (cpError) {
          throw new Error(`Payment logged to deal but failed to record in cash-collected feed: ${cpError.message}`);
        }
      } else {
        // Ensure cash_collected reflects zero explicitly
        await supabase
          .from('pitch_calls')
          .update({ cash_collected: 0 } as any)
          .eq('id', pitchCall.id);
      }

      // 5. Update discovery log if linked
      if (pitchCall.discovery_log_id) {
        await supabase
          .from('sales_discovery_logs')
          .update({
            converted_to_client: true,
            client_profile_id: clientProfile.id,
          })
          .eq('id', pitchCall.discovery_log_id);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user?.id || '')
        .single();

      const aeName = profile?.full_name || 'An Account Executive';

      // 6. Notify admins
      const adminRoles: Array<'admin' | 'dev' | 'ops' | 'csm'> = ['admin', 'dev', 'ops', 'csm'];
      const notifications = adminRoles.map(role => ({
        recipient_role: role,
        title: '🎉 New Deal Closed!',
        message: `${aeName} closed ${companyName.trim()} (£${cv.toLocaleString()}${isPif ? ' PIF' : ` over ${contractTerm}`}). Please refer to Onboarding.`,
        category: 'system' as const,
        link_url: '/admin/operations/onboarding',
        triggered_by: user?.id || null,
      }));

      await supabase.from('notifications').insert(notifications);

      // 18 Sep: if a partner acted as a reference for this deal, tell them
      // the finder's fee is theirs (bell via DB trigger, email here).
      if (pitchCall.discovery_log_id) {
        try {
          const { data: log } = await supabase.from('sales_discovery_logs').select('meeting_id').eq('id', pitchCall.discovery_log_id).maybeSingle();
          if (log?.meeting_id) {
            const { data: refs } = await supabase.from('partner_references' as never).select('id').eq('meeting_id', log.meeting_id);
            for (const r of ((refs ?? []) as unknown as Array<{ id: string }>)) {
              await supabase.functions.invoke('partner-reference', { body: { action: 'notify_closed', reference_id: r.id } });
            }
          }
        } catch (e) { console.warn('reference fee email skipped', e); }
      }
      toast.success(`${companyName} marked as won and sent to onboarding!`);
      queryClient.invalidateQueries({ queryKey: ['ae-pitch-calls'] });
      queryClient.invalidateQueries({ queryKey: ['pitch-calls'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-active-count'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-logs'] });
      queryClient.invalidateQueries({ queryKey: ['ae-cycle-deals'] });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error marking as won:", error);
      toast.error(error.message || "Failed to mark as won");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pitchCall) return null;

  const installmentPreview = (() => {
    if (!contractValue || !contractTerm || isPif) return null;
    const cv = parseFloat(contractValue);
    const m = termMonths(contractTerm);
    if (!m || !cv) return null;
    return cv / m;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isSubmitting && !o) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => isSubmitting && e.preventDefault()}
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Mark as Won
          </DialogTitle>
          <DialogDescription>
            Re-confirm the deal terms, capture cash collected today, and send this client to onboarding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Company Name *</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>

            <div>
              <Label>Contact Name *</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} required />
            </div>

            <div>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="col-span-2">
              <Label>Mobile</Label>
              <Input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. +44 7700 900000"
              />
            </div>

            <div>
              <Label>Contract Value (£) *</Label>
              <Input
                type="number"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="e.g. 9000"
              />
            </div>

            <div>
              <Label>Contract Term *</Label>
              <Select value={contractTerm} onValueChange={setContractTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3 months">3 months</SelectItem>
                  <SelectItem value="6 months">6 months</SelectItem>
                  <SelectItem value="12 months">12 months</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PIF toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <Label className="flex items-center gap-2">
                <PoundSterling className="h-4 w-4 text-yellow-500" />
                Paid in Full at close?
              </Label>
              <p className="text-xs text-muted-foreground mt-1">Toggle on if the client paid the full contract value today.</p>
            </div>
            <Switch checked={isPif} onCheckedChange={setIsPif} />
          </div>

          {isPif ? (
            <div>
              <Label>PIF Amount (£) *</Label>
              <Input
                type="number"
                value={pifAmount}
                onChange={(e) => setPifAmount(e.target.value)}
                placeholder={contractValue || "0.00"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Full amount collected today. Contract will show as fully paid.
              </p>
            </div>
          ) : (
            <div>
              <Label>Cash Collected Today (£)</Label>
              <Input
                type="number"
                value={firstPayment}
                onChange={(e) => setFirstPayment(e.target.value)}
                placeholder="Deposit / first installment (leave blank for 0)"
              />
              {installmentPreview !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining installments: <strong>£{installmentPreview.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</strong> / month over {contractTerm}.
                </p>
              )}
            </div>
          )}

          <div>
            <Label>Cash Collected (excluding VAT) (£)</Label>
            <Input
              type="number"
              value={cashExVat}
              onChange={(e) => setCashExVat(e.target.value)}
              placeholder="Net amount, ex VAT"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Feeds the CEO "New cash collected (not including VAT)" tile.
            </p>
          </div>


          <div>
            <Label>Special Agreements / Notes</Label>
            <Textarea
              value={specialAgreements}
              onChange={(e) => setSpecialAgreements(e.target.value)}
              placeholder="e.g. discount applied, deferred first payment, add-on services included/excluded"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              onClick={handleMarkAsWon}
              disabled={isSubmitting || !companyName.trim() || !contactName.trim() || !email.trim() || !contractValue || !contractTerm}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Trophy className="mr-2 h-4 w-4" />
                  Confirm & Send to Onboarding
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

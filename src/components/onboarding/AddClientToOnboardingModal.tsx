import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Loader2, Zap, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateAllTasksForClient } from "@/lib/onboardingStages";

interface AddClientToOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Adds a client to the ONBOARDING pipeline. Every path here creates an
 * onboarding-stage record for a client_profiles row with status 'pending' —
 * the client only becomes a full, active profile (Clients tab + Client
 * Health) when onboarding is explicitly completed on the board.
 *
 * Direct creation of a fully-fledged active client (bypassing onboarding)
 * lives in AddFullClientDialog on the Clients tab, not here.
 */
export function AddClientToOnboardingModal({ open, onOpenChange }: AddClientToOnboardingModalProps) {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [tab, setTab] = useState<string>("add");

  // Full "Add Client" form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [contractTerm, setContractTerm] = useState("");

  // Quick add form state
  const [quickCompanyName, setQuickCompanyName] = useState("");
  const [quickContactName, setQuickContactName] = useState("");
  const [quickWebsite, setQuickWebsite] = useState("");
  const [quickEmail, setQuickEmail] = useState("");

  const resetForm = () => {
    setSelectedClientId("");
    setCompanyName("");
    setContactName("");
    setMobile("");
    setEmail("");
    setWebsite("");
    setContractValue("");
    setContractTerm("");
    setQuickCompanyName("");
    setQuickContactName("");
    setQuickWebsite("");
    setQuickEmail("");
    setTab("add");
  };

  // Fetch clients not in onboarding
  const { data: availableClients, isLoading: isLoadingClients } = useQuery({
    queryKey: ['available-for-onboarding'],
    queryFn: async () => {
      const { data: allClients, error: clientsError } = await supabase
        .from('client_profiles')
        .select('id, company_name')
        .order('company_name');

      if (clientsError) throw clientsError;

      const { data: onboardingClients, error: onboardingError } = await supabase
        .from('client_onboarding_stages' as any)
        .select('*');

      if (onboardingError) throw onboardingError;

      // Soft-removed rows (removed_at set) don't block re-adding — those
      // clients are offered again and re-adding revives their row.
      const onboardingData = (onboardingClients || []) as any[];
      const onboardingIds = new Set(
        onboardingData.filter((c) => !c.removed_at).map((c) => c.client_profile_id)
      );

      return allClients?.filter(c => !onboardingIds.has(c.id)) || [];
    },
    enabled: open,
  });

  // Best-effort: tell the CSM team a client landed in onboarding. Never
  // blocks the add itself.
  const notifyOnboardingAdd = async (company: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('notifications').insert([{
        recipient_role: 'csm',
        title: 'New client in Onboarding',
        message: `${company} was added to the Onboarding pipeline.`,
        category: 'system',
        link_url: '/csm/onboarding',
        triggered_by: user?.id || null,
      } as any]);
    } catch (error: any) {
      console.error('Onboarding notification failed (non-blocking):', error);
    }
  };

  // Shared: add a client_profile_id to onboarding
  const addToOnboarding = async (clientId: string) => {
    // client_profile_id is UNIQUE on client_onboarding_stages: a previously
    // soft-removed client already has a row, so revive it (clearing
    // removed_at) instead of inserting — task history is preserved.
    const { data: existing } = await supabase
      .from('client_onboarding_stages' as any)
      .select('id')
      .eq('client_profile_id', clientId)
      .maybeSingle();

    if (existing) {
      const { error: reviveError } = await supabase
        .from('client_onboarding_stages' as any)
        .update({ removed_at: null, completed_at: null })
        .eq('id', (existing as any).id);
      if (reviveError) throw reviveError;
      return existing;
    }

    const { data: stageRecord, error: stageError } = await supabase
      .from('client_onboarding_stages' as any)
      .insert({
        client_profile_id: clientId,
        current_stage: 1,
        source: 'manual',
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

    const { error: tasksError } = await supabase
      .from('client_onboarding_tasks' as any)
      .insert(taskRecords as any);

    if (tasksError) throw tasksError;
    return stageData;
  };

  // Shared: create a pending client_profiles row, then put it in onboarding.
  // contract_term is written in a separate guarded update so the create still
  // works before the contract_term migration is applied.
  const createPendingClient = async (fields: {
    company_name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    website?: string;
    contract_value?: number;
    contract_term?: string;
  }) => {
    const { contract_term, ...base } = fields;
    const insertData: Record<string, any> = {
      ...base,
      status: 'pending',
    };
    const { data: newClient, error: clientError } = await supabase
      .from('client_profiles')
      .insert(insertData as any)
      .select('id')
      .single();

    if (clientError) throw clientError;

    if (contract_term) {
      const { error: termError } = await supabase
        .from('client_profiles')
        .update({ contract_term })
        .eq('id', newClient.id);
      if (termError) {
        console.error('contract_term not saved (migration pending?):', termError);
        toast.warning('Client saved, but the contract term could not be stored yet.');
      }
    }

    await addToOnboarding(newClient.id);
    await notifyOnboardingAdd(fields.company_name);
    return newClient;
  };

  const onAddSuccess = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['onboarding-clients'] });
    queryClient.invalidateQueries({ queryKey: ['available-for-onboarding'] });
    queryClient.invalidateQueries({ queryKey: ['onboarding-active-count'] });
    toast.success(message);
    resetForm();
    onOpenChange(false);
  };

  // Select existing client mutation
  const selectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error('No client selected');
      const result = await addToOnboarding(selectedClientId);
      const company = availableClients?.find(c => c.id === selectedClientId)?.company_name;
      if (company) await notifyOnboardingAdd(company);
      return result;
    },
    onSuccess: () => onAddSuccess('Client added to onboarding pipeline'),
    onError: (error: any) => {
      console.error('Error adding client to onboarding:', error);
      toast.error(`Failed to add client to onboarding: ${error?.message || 'Unknown error'}`);
    },
  });

  // Full "Add Client" mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!companyName.trim()) throw new Error('Company name is required');
      return createPendingClient({
        company_name: companyName.trim(),
        contact_name: contactName.trim() || undefined,
        phone: mobile.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        contract_value: contractValue ? parseFloat(contractValue) : undefined,
        contract_term: contractTerm || undefined,
      });
    },
    onSuccess: () => onAddSuccess('Client created and added to onboarding pipeline'),
    onError: (error: any) => {
      console.error('Error adding client:', error);
      toast.error(`Failed to create client: ${error?.message || 'Unknown error'}`);
    },
  });

  // Quick add mutation
  const quickAddMutation = useMutation({
    mutationFn: async () => {
      if (!quickCompanyName.trim()) throw new Error('Company name is required');
      return createPendingClient({
        company_name: quickCompanyName.trim(),
        contact_name: quickContactName.trim() || undefined,
        website: quickWebsite.trim() || undefined,
        email: quickEmail.trim() || undefined,
      });
    },
    onSuccess: () => onAddSuccess('Client created and added to onboarding pipeline'),
    onError: (error: any) => {
      console.error('Error quick-adding client:', error);
      toast.error(`Failed to create client: ${error?.message || 'Unknown error'}`);
    },
  });

  const isPending = selectMutation.isPending || addMutation.isPending || quickAddMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Add Client to Onboarding
          </DialogTitle>
          <DialogDescription>
            New clients start in the onboarding pipeline and appear in the Clients tab once onboarding is completed.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="add" className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Add Client
            </TabsTrigger>
            <TabsTrigger value="quick" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Quick Add
            </TabsTrigger>
            <TabsTrigger value="select" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Existing
            </TabsTrigger>
          </TabsList>

          {/* Full add: new client with deal details */}
          <TabsContent value="add" className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-companyName">Company Name *</Label>
                <Input
                  id="ob-companyName"
                  placeholder="e.g. Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-contactName">Contact Name</Label>
                  <Input
                    id="ob-contactName"
                    placeholder="e.g. John Smith"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-mobile">Mobile</Label>
                  <Input
                    id="ob-mobile"
                    placeholder="e.g. +44 7700 900000"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-email">Email</Label>
                <Input
                  id="ob-email"
                  type="email"
                  placeholder="e.g. john@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-website">Company Website</Label>
                <Input
                  id="ob-website"
                  placeholder="e.g. https://acme.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-contractValue">Contract Value (£)</Label>
                  <Input
                    id="ob-contractValue"
                    type="number"
                    placeholder="e.g. 9000"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-contractTerm">Contract Term</Label>
                  <Select value={contractTerm} onValueChange={setContractTerm}>
                    <SelectTrigger id="ob-contractTerm">
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!companyName.trim() || isPending}
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create & Add to Onboarding
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Quick add new client */}
          <TabsContent value="quick" className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Acme Corp"
                  value={quickCompanyName}
                  onChange={(e) => setQuickCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Contact Name</Label>
                <Input
                  id="contactName"
                  placeholder="e.g. John Smith"
                  value={quickContactName}
                  onChange={(e) => setQuickContactName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Company Website</Label>
                <Input
                  id="website"
                  placeholder="e.g. https://acme.com"
                  value={quickWebsite}
                  onChange={(e) => setQuickWebsite(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. john@acme.com"
                  value={quickEmail}
                  onChange={(e) => setQuickEmail(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Other details (mobile, contract, industry) can be completed later from the client profile.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => quickAddMutation.mutate()}
                disabled={!quickCompanyName.trim() || isPending}
              >
                {quickAddMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create & Add to Onboarding
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Select existing client */}
          <TabsContent value="select" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="client">Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger id="client">
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-60">
                    {isLoadingClients ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableClients?.length === 0 ? (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        No clients available. All clients are already in onboarding.
                      </div>
                    ) : (
                      availableClients?.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name}
                        </SelectItem>
                      ))
                    )}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => selectMutation.mutate()}
                disabled={!selectedClientId || isPending}
              >
                {selectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add to Onboarding
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

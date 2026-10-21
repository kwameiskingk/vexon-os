import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Search, Plus, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientProfile {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  email?: string; // Fetched separately from profiles table
}

interface ClientAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onAssigned: () => void;
}

export const ClientAssignmentModal = ({ open, onOpenChange, meetingId, onAssigned }: ClientAssignmentModalProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllClients, setShowAllClients] = useState(false);
  const [clientProfiles, setClientProfiles] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadClientProfiles();
    }
  }, [open, showAllClients, searchTerm]);

  const loadClientProfiles = async () => {
    try {
      setLoading(true);
      // Fetch ALL client_profiles (including those without accounts)
      let query = supabase
        .from("client_profiles")
        .select("id, user_id, company_name, contact_name")
        .eq("status", "active");

      const { data, error } = await query.order("company_name", { ascending: true });

      if (error) throw error;

      // Fetch all client_profile_users to check for linked accounts
      const { data: profileUsers } = await supabase
        .from("client_profile_users")
        .select("client_profile_id, user_id");

      const profileUserMap = new Map<string, string[]>();
      (profileUsers || []).forEach(pu => {
        const existing = profileUserMap.get(pu.client_profile_id) || [];
        existing.push(pu.user_id);
        profileUserMap.set(pu.client_profile_id, existing);
      });

      // Fetch emails and check account status
      const profilesWithEmail = await Promise.all(
        (data || []).map(async (profile) => {
          let email = "";
          
          // Check both direct user_id AND client_profile_users join table
          const linkedUserIds = profileUserMap.get(profile.id) || [];
          const hasDirectLink = !!profile.user_id;
          const hasJoinTableLink = linkedUserIds.length > 0;
          const hasAccount = hasDirectLink || hasJoinTableLink;
          
          // Get email from the primary user (direct link takes priority)
          const primaryUserId = profile.user_id || linkedUserIds[0];
          if (primaryUserId) {
            const { data: userData } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", primaryUserId)
              .maybeSingle();
            email = userData?.email || "";
          }

          return {
            ...profile,
            email,
            has_account: hasAccount
          };
        })
      );

      // Filter by search term if provided
      const filtered = searchTerm
        ? profilesWithEmail.filter(p =>
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : profilesWithEmail;

      setClientProfiles(filtered);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const assignClient = async () => {
    if (!selectedClient) return;

    try {
      // Get the selected client's full details
      const client = clientProfiles.find(c => c.id === selectedClient);
      if (!client) {
        toast.error("Client profile not found");
        return;
      }

      console.log("🔧 Assigning client to meeting:", { 
        meetingId, 
        clientProfileId: client.id, 
        clientUserId: client.user_id 
      });

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Admin user not authenticated");
        return;
      }

      // Get current meeting to check status and verbal_acceptance
      const { data: currentMeeting, error: fetchError } = await supabase
        .from("meetings")
        .select("status, verbal_acceptance, approved_by_admin")
        .eq("id", meetingId)
        .single();

      if (fetchError) {
        console.error("❌ Failed to fetch meeting:", fetchError);
        throw fetchError;
      }

      // Determine new status - only change to approved if currently pending
      const newStatus = currentMeeting?.approved_by_admin ? currentMeeting.status : "approved";
      
      // Auto-accept if verbally accepted
      const autoAccept = currentMeeting?.verbal_acceptance === true;

      console.log("📝 Updating meeting with:", {
        client_profile_id: client.id,
        client_user_id: client.user_id,
        status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        approved_by_admin: true,
        client_accepted: autoAccept ? true : null,
        client_has_account: !!client.user_id
      });

      // ATOMIC UPDATE: Write all fields at once
      const { data: updatedMeeting, error } = await supabase
        .from("meetings")
        .update({ 
          client_profile_id: client.id,
          client_user_id: client.user_id,
          status: newStatus,
          approved_by: currentMeeting?.approved_by_admin ? undefined : user.id,
          approved_at: currentMeeting?.approved_by_admin ? undefined : new Date().toISOString(),
          approved_by_admin: true,
          client_accepted: autoAccept ? true : undefined,
          client_has_account: !!client.user_id
        })
        .eq("id", meetingId)
        .select()
        .single();

      if (error) {
        console.error("❌ Database update failed:", error);
        throw error;
      }

      console.log("✅ Meeting updated successfully:", updatedMeeting);

      // Verify the update persisted
      if (!updatedMeeting.client_profile_id) {
        console.error("⚠️ Warning: Update returned but client_profile_id is null:", updatedMeeting);
        toast.error("Assignment failed — meeting not updated");
        return;
      }

      // Log the action
      await supabase.from("admin_activity_log").insert({
        action: "meeting_assigned_and_approved",
        details: { 
          meeting_id: meetingId, 
          client_profile_id: client.id,
          client_user_id: client.user_id,
          new_status: newStatus
        }
      });

      toast.success("Client assigned successfully");
      onAssigned(); // This triggers the parent to refresh
      onOpenChange(false);
    } catch (error: any) {
      console.error("❌ Assignment error:", error);
      toast.error(`Assignment failed: ${error.message}`);
    }
  };

  const createClientFromEmail = async () => {
    const email = searchTerm.trim();
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      // Check if user exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      let userId = existingProfile?.id;

      // If user doesn't exist, we can't create them (auth requires signup)
      if (!userId) {
        toast.error("No user found with this email. User must sign up first.");
        return;
      }

      // Check if user has client role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleData?.role !== "client") {
        // Update role to client
        await supabase.from("user_roles").delete().eq("user_id", userId);
        await supabase.from("user_roles").insert({ user_id: userId, role: "client" });
      }

      // Create or update client profile
      const { data: clientProfile, error: profileError } = await supabase
        .from("client_profiles")
        .upsert({
          user_id: userId,
          company_name: "Pending",
          status: "active"
        }, { onConflict: "user_id" })
        .select()
        .single();

      if (profileError) throw profileError;

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Admin not authenticated");

      // Assign to meeting with full atomic update
      const { data: updatedMeeting, error: updateError } = await supabase
        .from("meetings")
        .update({ 
          client_profile_id: clientProfile.id,
          client_user_id: userId,
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approved_by_admin: true
        })
        .eq("id", meetingId)
        .select()
        .single();

      if (updateError) throw updateError;

      console.log("✅ New client created and meeting assigned:", updatedMeeting);

      await supabase.from("admin_activity_log").insert({
        action: "client_profile_created_from_email",
        details: { email, meeting_id: meetingId, client_profile_id: clientProfile.id }
      });

      toast.success("Client profile created and assigned");
      onAssigned();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const createMinimalClient = async () => {
    try {
      const { data: clientProfile, error } = await supabase
        .from("client_profiles")
        .insert({
          user_id: null as any, // Will need to link later
          company_name: "Pending",
          contact_name: "Pending",
          status: "active"
        })
        .select()
        .single();

      if (error) throw error;

      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Admin not authenticated");

      // Assign to meeting with atomic update
      const { data: updatedMeeting, error: updateError } = await supabase
        .from("meetings")
        .update({ 
          client_profile_id: clientProfile.id,
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approved_by_admin: true
        })
        .eq("id", meetingId)
        .select()
        .single();

      if (updateError) throw updateError;

      console.log("✅ Minimal client created and meeting assigned:", updatedMeeting);

      await supabase.from("admin_activity_log").insert({
        action: "minimal_client_profile_created",
        details: { meeting_id: meetingId, client_profile_id: clientProfile.id }
      });

      toast.success("Minimal client profile created and assigned");
      onAssigned();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Client to Meeting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, company, or contact name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={showAllClients}
              onCheckedChange={setShowAllClients}
              id="show-all"
            />
            <Label htmlFor="show-all">Show all clients</Label>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : clientProfiles.length === 0 ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground text-center">
                No Client Profiles found. Create a new profile to continue.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={createClientFromEmail} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Client Profile from Email
                </Button>
                <Button onClick={createMinimalClient} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Minimal Client Profile
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {clientProfiles.map((client: any) => (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClient(client.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedClient === client.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{client.company_name}</div>
                      {client.has_account ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Account Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          No Account
                        </Badge>
                      )}
                    </div>
                    {client.email && <div className="text-sm text-muted-foreground">{client.email}</div>}
                    {client.contact_name && (
                      <div className="text-sm text-muted-foreground">{client.contact_name}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={assignClient} disabled={!selectedClient}>
                  Assign Client
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

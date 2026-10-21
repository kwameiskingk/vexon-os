import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Copy } from "lucide-react";

export const InviteAdminModal = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const generateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generate unique invite code
      const inviteCode = `admin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create invite (expires in 24 hours)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { data: currentUser } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("invites").insert({
        invite_code: inviteCode,
        invited_email: email,
        role: "admin",
        created_by: currentUser.user?.id,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      // Log activity
      await supabase.from("admin_activity_log").insert({
        action: "admin_invite_created",
        details: { invited_email: email, invite_code: inviteCode },
      });

      const link = `${window.location.origin}/admin-auth?invite=${inviteCode}`;
      setInviteLink(link);
      
      toast.success("Admin invite created successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Invite link copied to clipboard!");
  };

  const handleClose = () => {
    setOpen(false);
    setEmail("");
    setInviteLink("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="h-4 w-4" />
          Invite Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite New Admin</DialogTitle>
          <DialogDescription>
            Generate a secure invite link for a new admin user
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <form onSubmit={generateInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Admin Email *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Invite link will be valid for 24 hours
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Generating..." : "Generate Invite"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invite Link</Label>
              <div className="flex gap-2">
                <Input
                  value={inviteLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyToClipboard}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with {email}. It expires in 24 hours.
              </p>
            </div>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

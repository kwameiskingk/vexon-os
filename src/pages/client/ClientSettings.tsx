import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, Lock, Users, Plus, Copy, Check, UserPlus } from "lucide-react";
import { ProfilePictureUpload } from "@/components/settings/ProfilePictureUpload";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SecondaryUser {
  id?: string;
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
  phone?: string | null;
  created_at?: string;
}

const ClientSettings = () => {
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ full_name: "", email: "", phone: "", avatar_url: null as string | null });
  const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" });
  
  // Secondary users state
  const [secondaryUsers, setSecondaryUsers] = useState<SecondaryUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState({ email: "", password: "" });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    loadSecondaryUsers();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) setProfile(data);
  };

  const loadSecondaryUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("client-secondary-users", {
        body: {},
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load secondary users");

      setSecondaryUsers(data.secondaryUsers || []);
    } catch (error: any) {
      console.error("Failed to load secondary users:", error);
      setSecondaryUsers([]);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: profile.full_name, phone: profile.phone })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
        data: { requires_password_change: false },
      });
      if (error) throw error;
      toast.success("Password updated successfully");
      setPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSecondaryUser = async () => {
    if (!newUserEmail || !newUserEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-secondary-client-user`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: newUserEmail }),
      });

      const result = await res.json();
      if (!result.success) {
        toast.error(result.error || "Failed to create user");
        return;
      }

      setCreatedCredentials({ email: result.email, password: result.tempPassword });
      setShowCredentials(true);
      setNewUserEmail("");
      await loadSecondaryUsers();
      toast.success("Secondary user created successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader
          title="Settings"
          subtitle="Manage your profile and account settings"
          gradient
        />
        <div className="space-y-6">
          <div className="grid gap-5">
            {/* Personal Information */}
            <Card className="border-border shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  <CardTitle>Personal Information</CardTitle>
                </div>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {userId && (
                  <ProfilePictureUpload
                    userId={userId}
                    currentAvatarUrl={profile.avatar_url}
                    userName={profile.full_name || "User"}
                    onUploadSuccess={(url) => setProfile({ ...profile, avatar_url: url })}
                  />
                )}
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Read-only)</Label>
                  <Input id="email" value={profile.email} disabled className="bg-muted border-border" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profile.phone || ""}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="bg-secondary border-border"
                  />
                </div>
                <Button onClick={handleSaveProfile} disabled={loading} className="bg-primary hover:bg-primary/90">
                  {loading ? "Saving..." : "Save Personal Info"}
                </Button>
              </CardContent>
            </Card>

            {/* Secondary Users */}
            <Card className="border-border shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle>Secondary Users</CardTitle>
                  </div>
                  <Badge variant="outline">{secondaryUsers.length}/3</Badge>
                </div>
                <CardDescription>
                  Add up to 3 additional users who can access your client portal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing secondary users */}
                {secondaryUsers.length > 0 && (
                  <div className="space-y-2">
                    {secondaryUsers.map((su) => (
                      <div key={su.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{su.full_name || "Pending Setup"}</p>
                            <p className="text-xs text-muted-foreground break-all">{su.email || "No email available"}</p>
                            {su.phone && <p className="text-xs text-muted-foreground">{su.phone}</p>}
                          </div>
                        </div>
                        <Badge variant={su.full_name ? "default" : "secondary"}>
                          {su.full_name ? "Active" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new user */}
                {secondaryUsers.length < 3 ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter email address"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="bg-secondary border-border"
                      disabled={creatingUser}
                    />
                    <Button
                      onClick={handleCreateSecondaryUser}
                      disabled={creatingUser || !newUserEmail}
                      className="shrink-0"
                    >
                      {creatingUser ? (
                        "Creating..."
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Add User
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Maximum of 3 secondary users reached
                  </p>
                )}

                {secondaryUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No secondary users added yet. Add team members so they can access the portal too.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card className="border-border shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  <CardTitle>Change Password</CardTitle>
                </div>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="bg-secondary border-border"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="bg-secondary border-border"
                    placeholder="Confirm new password"
                  />
                </div>
                <Button
                  onClick={handlePasswordChange}
                  disabled={loading || !passwordData.newPassword || !passwordData.confirmPassword}
                  className="bg-primary hover:bg-primary/90"
                >
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Credentials Modal */}
        <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                User Created Successfully
              </DialogTitle>
              <DialogDescription>
                Copy these credentials and share them with the new user. The password is temporary and should be changed on first login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex gap-2">
                  <Input value={createdCredentials.email} readOnly className="bg-muted" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(createdCredentials.email, "email")}
                  >
                    {copiedField === "email" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <div className="flex gap-2">
                  <Input value={createdCredentials.password} readOnly className="bg-muted" />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(createdCredentials.password, "password")}
                  >
                    {copiedField === "password" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The new user will be asked to complete their profile (name and phone number) when they first log in.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
};

export default ClientSettings;

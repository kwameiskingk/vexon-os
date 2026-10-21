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
import { Settings, Lock } from "lucide-react";
import { ProfilePictureUpload } from "@/components/settings/ProfilePictureUpload";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";

/** Partner account settings — the ClientSettings pattern minus secondary
 *  users (partner accounts are 1:1). */
const PartnerSettings = () => {
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ full_name: "", email: "", phone: "", avatar_url: null as string | null });
  const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" });
  const { partner } = usePartnerProfile();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) setProfile(data);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="partner">
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
                {partner?.company_name && (
                  <div className="space-y-2">
                    <Label htmlFor="company">Company (Read-only)</Label>
                    <Input id="company" value={partner.company_name} disabled className="bg-muted border-border" />
                  </div>
                )}
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
      </PageContainer>
    </DashboardLayout>
  );
};

export default PartnerSettings;

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings, Lock, Shield } from "lucide-react";
import { useDevRole } from "@/hooks/useDevRole";
import { UserRoleManagement } from "@/components/settings/UserRoleManagement";
import { PortalAccessManagement } from "@/components/settings/PortalAccessManagement";
import { AuditLogs } from "@/components/settings/AuditLogs";

import { ProfilePictureUpload } from "@/components/settings/ProfilePictureUpload";
import { FormPopupSettings } from "@/components/settings/FormPopupSettings";
import { UsefulLinksManagement } from "@/components/settings/UsefulLinksManagement";

const AdminSettings = () => {
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    avatarUrl: null as string | null,
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { isDev, loading: devLoading } = useDevRole();
  const [canSeeHourlySettings, setCanSeeHourlySettings] = useState(false);

  useEffect(() => {
    const checkHourlyAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["dev"]);
      setCanSeeHourlySettings(!!(data && data.length > 0));
    };
    checkHourlyAccess();
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileData) {
        setProfile({
          fullName: profileData.full_name || "",
          email: profileData.email || "",
          phone: profileData.phone || "",
          avatarUrl: profileData.avatar_url || null,
        });
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.fullName,
          phone: profile.phone,
        })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Profile updated successfully");
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
        password: passwordData.newPassword
      });

      if (error) throw error;
      
      toast.success("Password updated successfully");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Settings" 
          subtitle="Manage your account settings and preferences"
          gradient
        />
        <div className="space-y-6">
          {/* Profile Information - visible to all */}
          <Card className="border-border shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Profile Information</CardTitle>
              </div>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {userId && (
                <ProfilePictureUpload
                  userId={userId}
                  currentAvatarUrl={profile.avatarUrl}
                  userName={profile.fullName || "User"}
                  onUploadSuccess={(url) => setProfile({ ...profile, avatarUrl: url })}
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Read-only)</Label>
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="bg-muted border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="bg-secondary border-border"
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={loading}
                className="bg-primary hover:bg-primary/90"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Change Password - visible to all */}
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

          {/* Form Pop-up Settings - dev, admin, sdr_manager only */}
          {canSeeHourlySettings && (
            <>
              <Separator className="my-8" />
              <div className="space-y-1 mb-4">
                <h2 className="text-xl font-semibold">Form Pop-up Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Configure Start of Day, Hourly Update, and End of Day pop-up forms.
                </p>
              </div>
              <FormPopupSettings />
            </>
          )}

          {/* Dev tools moved to Dev Center */}
          {!devLoading && isDev && (
            <>
              <Separator className="my-8" />
              <Card className="border-violet-500/30 bg-violet-500/5 shadow-card">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-violet-500" />
                    <CardTitle>Dev tools have moved</CardTitle>
                  </div>
                  <CardDescription>
                    User roles, portal access, AE compensation, useful links, system defaults, form pop-up settings,
                    and audit logs now live in the Dev Command Center.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => (window.location.href = "/dev")}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    Open Dev Center →
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default AdminSettings;

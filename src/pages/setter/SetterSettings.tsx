import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel } from "@/components/ui-v2";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ProfilePictureUpload } from "@/components/settings/ProfilePictureUpload";

export interface SetterSettingsProfile {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  avatar_url: string | null;
}

/** Bank details, stored on setters_profiles. HR reads the same columns in the employee hub. */
export interface SetterBankDetails {
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  sort_code: string;
  iban: string;
  swift_bic: string;
  bank_country: string;
}

const EMPTY_BANK_DETAILS: SetterBankDetails = {
  bank_name: "", account_holder_name: "", account_number: "", sort_code: "", iban: "", swift_bic: "", bank_country: "",
};

export interface SetterSettingsViewProps {
  userId: string | null;
  profile: SetterSettingsProfile;
  setProfile: (p: SetterSettingsProfile) => void;
  loading: boolean;
  onSave: () => void;
  bank: SetterBankDetails;
  setBank: (b: SetterBankDetails) => void;
  onSaveBank: () => void;
  /** Resolves true when the password was changed (so the form clears). */
  onChangePassword: (newPassword: string) => Promise<boolean>;
  /** Demo surface: the photo picker previews locally instead of uploading. */
  demo?: boolean;
}

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures). Password validation stays here; the
 * actual auth call comes in through onChangePassword.
 */
export const SetterSettingsView = ({ userId, profile, setProfile, loading, onSave, bank, setBank, onSaveBank, onChangePassword, demo }: SetterSettingsViewProps) => {
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const { toast } = useToast();
  const handleSave = onSave;

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    const ok = await onChangePassword(passwordData.newPassword);
    if (ok) setPasswordData({ newPassword: "", confirmPassword: "" });
  };

  return (
    <DashboardLayout role="setter">
      <PageContainer narrow>
        <PageHeader title="Settings" subtitle="Your profile, payout details and password" />
        <div className="space-y-6">
          <div className="grid gap-5">
          <Panel title="Profile Information" meta="Update your personal information">
            <div className="space-y-4 pt-1">
              {userId && (
                <ProfilePictureUpload
                  userId={userId}
                  currentAvatarUrl={profile.avatar_url}
                  userName={profile.full_name || "User"}
                  onUploadSuccess={(url) => setProfile({ ...profile, avatar_url: url })}
                  demo={demo}
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  
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
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone || ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  
                />
              </div>
              <ButtonV2 variant="primary" onClick={handleSave} disabled={loading}>{loading ? "Saving…" : "Save Changes"}</ButtonV2>
            </div>
          </Panel>

          {/* Payout details (12 Oct): what HR pays into. Same columns the employee hub shows. */}
          <Panel title="Payout details" meta="Where your pay goes. Only you and HR can see this.">
            <div className="space-y-4 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ["bank_name", "Bank name", "e.g. FNB"],
                  ["account_holder_name", "Account holder name", ""],
                  ["account_number", "Account number", ""],
                  ["sort_code", "Sort code or branch code", "e.g. 12-34-56"],
                  ["iban", "IBAN (if international)", ""],
                  ["swift_bic", "SWIFT / BIC (if international)", ""],
                  ["bank_country", "Bank country", "e.g. South Africa"],
                ] as const).map(([key, label, placeholder]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`bank_${key}`}>{label}</Label>
                    <Input
                      id={`bank_${key}`}
                      value={bank[key]}
                      placeholder={placeholder}
                      onChange={(e) => setBank({ ...bank, [key]: e.target.value })}
                      
                    />
                  </div>
                ))}
              </div>
              <ButtonV2 variant="primary" onClick={onSaveBank} disabled={loading}>{loading ? "Saving…" : "Save payout details"}</ButtonV2>
            </div>
          </Panel>

          <Panel title="Change Password" meta="Update your account password">
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  
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
                  
                  placeholder="Confirm new password"
                />
              </div>

              <ButtonV2 variant="primary" onClick={handlePasswordChange} disabled={loading || !passwordData.newPassword || !passwordData.confirmPassword}>
                {loading ? "Updating…" : "Update password"}
              </ButtonV2>
            </div>
          </Panel>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

const SetterSettings = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SetterSettingsProfile>({ full_name: "", email: "", phone: "", company_name: "", avatar_url: null });
  const [bank, setBank] = useState<SetterBankDetails>(EMPTY_BANK_DETAILS);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);
    const [{ data }, { data: sp }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("setters_profiles")
        .select("bank_name, account_holder_name, account_number, sort_code, iban, swift_bic, bank_country")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (data) setProfile(data as unknown as SetterSettingsProfile);
    if (sp) {
      setBank({
        bank_name: sp.bank_name || "", account_holder_name: sp.account_holder_name || "", account_number: sp.account_number || "",
        sort_code: sp.sort_code || "", iban: sp.iban || "", swift_bic: sp.swift_bic || "", bank_country: sp.bank_country || "",
      });
    }
  };

  const handleSaveBank = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const clean = Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.trim() || null]));
      const { error } = await supabase.from("setters_profiles").update(clean).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Saved", description: "Payout details updated. HR sees them on your profile." });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Could not save", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("profiles").update({
        full_name: profile.full_name,
        phone: profile.phone,
      }).eq("id", user.id);

      if (error) throw error;
      toast({ title: "Success", description: "Profile updated successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (newPassword: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Success", description: "Password updated successfully!" });
      return true;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <SetterSettingsView
      userId={userId}
      profile={profile}
      setProfile={setProfile}
      loading={loading}
      onSave={handleSave}
      bank={bank}
      setBank={setBank}
      onSaveBank={handleSaveBank}
      onChangePassword={handlePasswordChange}
    />
  );
};

export default SetterSettings;

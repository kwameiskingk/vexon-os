import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Clock, TestTube } from "lucide-react";

const AVAILABLE_ROLES = [
  { value: "setter", label: "Setters" },
  { value: "account_executive", label: "Account Executives" },
  { value: "csm", label: "CSMs" },
  { value: "sdr_manager", label: "SDR Managers" },
  { value: "gtm_engineer", label: "GTM Engineers" },
];

export function HourlyUpdateSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["hourly-update-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hourly_update_settings")
        .select("*")
        .limit(1)
        .single();
      return data;
    },
  });

  const handleToggle = async (enabled: boolean) => {
    if (!settings) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("hourly_update_settings")
      .update({ enabled, updated_by: user?.id })
      .eq("id", settings.id);
    if (error) toast.error("Failed to update");
    else {
      toast.success(enabled ? "Hourly updates enabled" : "Hourly updates disabled");
      queryClient.invalidateQueries({ queryKey: ["hourly-update-settings"] });
    }
    setSaving(false);
  };

  const handleRoleToggle = async (role: string, checked: boolean) => {
    if (!settings) return;
    const currentRoles: string[] = settings.target_roles || [];
    const newRoles = checked
      ? [...currentRoles, role]
      : currentRoles.filter((r: string) => r !== role);

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("hourly_update_settings")
      .update({ target_roles: newRoles, updated_by: user?.id })
      .eq("id", settings.id);
    if (error) toast.error("Failed to update roles");
    else {
      toast.success("Target roles updated");
      queryClient.invalidateQueries({ queryKey: ["hourly-update-settings"] });
    }
    setSaving(false);
  };

  if (isLoading) return null;

  const targetRoles: string[] = settings?.target_roles || [];

  return (
    <>
      <Card className="border-border shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Hourly Update Form</CardTitle>
          </div>
          <CardDescription>
            Control the hourly update form that requires selected users to submit dials, talk time, and support needs every hour (10 AM – 5 PM UK time).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Enable Hourly Updates</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                When enabled, targeted users will be prompted every hour to submit their update.
              </p>
            </div>
            <Switch
              checked={settings?.enabled || false}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
          </div>

          {/* Role selector */}
          <div className="space-y-3">
            <div>
              <Label className="text-base font-medium">Target Roles</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select which roles must complete the hourly update form.
              </p>
            </div>
            <div className="space-y-2">
              {AVAILABLE_ROLES.map((role) => (
                <div key={role.value} className="flex items-center gap-3">
                  <Checkbox
                    id={`role-${role.value}`}
                    checked={targetRoles.includes(role.value)}
                    onCheckedChange={(checked) => handleRoleToggle(role.value, checked as boolean)}
                    disabled={saving}
                  />
                  <Label htmlFor={`role-${role.value}`} className="cursor-pointer">
                    {role.label}
                  </Label>
                  {targetRoles.includes(role.value) && (
                    <Badge variant="secondary" className="text-xs">Active</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Test button */}
          <div className="pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setShowTestModal(true)}
              className="gap-2"
            >
              <TestTube className="h-4 w-4" />
              Test Hourly Update Flow
            </Button>
            <p className="text-xs text-muted-foreground mt-1.5">
              Opens the hourly update modal as if you were a targeted user.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Hourly Update Form Required</CardTitle>
              </div>
              <CardDescription>
                This is what targeted users see when they have a pending hourly update.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Button onClick={() => { setShowTestModal(false); navigate("/forms"); }} className="flex-1">
                  Complete
                </Button>
                <Button variant="outline" onClick={() => setShowTestModal(false)} className="flex-1">
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

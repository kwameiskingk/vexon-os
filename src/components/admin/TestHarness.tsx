import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const TestHarness = ({ onTestCreated }: { onTestCreated?: () => void }) => {
  const [generating, setGenerating] = useState(false);

  const generateTestFlow = async () => {
    setGenerating(true);
    try {
      const testNum = Date.now();
      const testClientEmail = `test.client+${testNum}@vexon.local`;
      const testSetterEmail = `test.setter+${testNum}@vexon.local`;

      // 1. Create test client user
      const { data: clientAuthData, error: clientSignUpError } = await supabase.auth.signUp({
        email: testClientEmail,
        password: "TestPass123!",
        options: {
          data: { full_name: `Test Client ${testNum}` },
        },
      });

      if (clientSignUpError) throw clientSignUpError;
      if (!clientAuthData.user) throw new Error("Client user creation failed");

      // Assign client role
      await supabase.from("user_roles").insert({
        user_id: clientAuthData.user.id,
        role: "client",
      });

      // Create client profile
      const { data: clientProfile, error: clientProfileError } = await supabase
        .from("client_profiles")
        .insert({
          user_id: clientAuthData.user.id,
          company_name: `Test Company ${testNum}`,
          contact_name: `Test Client ${testNum}`,
          onboarding_complete: true,
        })
        .select()
        .single();

      if (clientProfileError) throw clientProfileError;

      // 2. Create test setter user
      const { data: setterAuthData, error: setterSignUpError } = await supabase.auth.signUp({
        email: testSetterEmail,
        password: "TestPass123!",
        options: {
          data: { full_name: `Test Setter ${testNum}` },
        },
      });

      if (setterSignUpError) throw setterSignUpError;
      if (!setterAuthData.user) throw new Error("Setter user creation failed");

      // Assign setter role
      await supabase.from("user_roles").insert({
        user_id: setterAuthData.user.id,
        role: "setter",
      });

      // Create setter profile
      const { data: setterProfile, error: setterProfileError } = await supabase
        .from("setters_profiles")
        .insert({
          user_id: setterAuthData.user.id,
          email: testSetterEmail,
          full_name: `Test Setter ${testNum}`,
          active: true,
        })
        .select()
        .single();

      if (setterProfileError) throw setterProfileError;

      // 3. Create a test meeting
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .insert({
          setter_id: setterAuthData.user.id,
          setter_profile_id: setterProfile.id,
          company_name: "Test Prospect Co",
          prospect_name: "John Test Prospect",
          prospect_email: `prospect+${testNum}@example.com`,
          meeting_date: new Date(Date.now() + 86400000).toISOString().split("T")[0], // tomorrow
          meeting_time: "14:00",
          status: "pending",
        })
        .select()
        .single();

      if (meetingError) throw meetingError;

      // Log test creation
      await supabase.from("admin_activity_log").insert({
        action: "test_harness_generated",
        details: {
          client_email: testClientEmail,
          setter_email: testSetterEmail,
          client_profile_id: clientProfile.id,
          setter_profile_id: setterProfile.id,
          meeting_id: meeting.id,
        },
      });

      toast.success(
        `Test flow created! Client: ${testClientEmail}, Setter: ${testSetterEmail}, Meeting ID: ${meeting.id.slice(0, 8)}...`
      );

      onTestCreated?.();
    } catch (error: any) {
      toast.error(`Test generation failed: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button onClick={generateTestFlow} disabled={generating} variant="outline">
      {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Generate Test Flow
    </Button>
  );
};

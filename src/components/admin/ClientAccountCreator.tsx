import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Check, Mail, Clock } from "lucide-react";

interface ClientAccountCreatorProps {
  clientId: string;
  clientEmail: string;
  hasAccount: boolean;
  isOnboarded?: boolean;
  onAccountCreated: () => void;
}

interface SecondaryUser {
  user_id: string;
  email: string;
  full_name: string;
}

export const ClientAccountCreator = ({
  clientId,
  clientEmail,
  hasAccount,
  isOnboarded = false,
  onAccountCreated,
}: ClientAccountCreatorProps) => {
  const [creating, setCreating] = useState(false);
  const [loadingSecondaryUsers, setLoadingSecondaryUsers] = useState(false);
  const [secondaryUsers, setSecondaryUsers] = useState<SecondaryUser[]>([]);

  const loadSecondaryUsers = async () => {
    setLoadingSecondaryUsers(true);

    try {
      const { data, error } = await supabase.functions.invoke("client-secondary-users", {
        body: { clientProfileId: clientId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load secondary users");

      setSecondaryUsers(data.secondaryUsers || []);
    } catch (error: any) {
      console.error("Failed to load secondary users:", error);
      setSecondaryUsers([]);
    } finally {
      setLoadingSecondaryUsers(false);
    }
  };

  useEffect(() => {
    loadSecondaryUsers();
  }, [clientId]);

  const createClientAccount = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-client-account",
        {
          body: { clientProfileId: clientId },
        }
      );

      if (error) {
        throw new Error(error.message || "Account creation failed — please try again");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Account creation failed — please try again");
      }

      toast.success(
        data?.invite_sent
          ? "Client account created — a set-password email is on its way to them."
          : "Client account created, but the set-password email couldn't be sent — check RESEND_API_KEY.",
        { duration: 8000 }
      );

      onAccountCreated();
    } catch (error: any) {
      console.error("Create client account error:", error);
      toast.error(error.message || "Account creation failed — please try again");
    } finally {
      setCreating(false);
    }
  };

  const secondaryUsersSummary = (
    <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Secondary Users</p>
        <Badge variant="outline">{secondaryUsers.length}/3</Badge>
      </div>

      {loadingSecondaryUsers ? (
        <p className="text-xs text-muted-foreground">Loading secondary users...</p>
      ) : secondaryUsers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No secondary users added yet.</p>
      ) : (
        <ul className="space-y-2">
          {secondaryUsers.map((user) => (
            <li key={user.user_id} className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-sm font-medium text-foreground">{user.full_name || "Pending profile completion"}</p>
              <p className="text-xs text-muted-foreground break-all">{user.email}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (hasAccount && isOnboarded) {
    return (
      <Card className="border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.08)]">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Client Account Setup
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.12)] px-3 py-1 text-sm font-medium text-[hsl(var(--success))]">
              <Check className="h-4 w-4" />
              Active • Onboarded
            </span>
          </CardTitle>
          <CardDescription>
            The client has logged in and updated their password.
          </CardDescription>
        </CardHeader>
        <CardContent>{secondaryUsersSummary}</CardContent>
      </Card>
    );
  }

  if (hasAccount && !isOnboarded) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Client Account Setup
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1 text-sm font-medium text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Account Created
            </span>
          </CardTitle>
          <CardDescription>
            Account exists for {clientEmail}. Awaiting first password change / onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The client should sign in using the temporary password and will be prompted to set a new password.
          </p>
          {secondaryUsersSummary}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-5 w-5" />
          Client Account Setup
        </CardTitle>
        <CardDescription>
          Create a client account for {clientEmail} — they receive a branded set-password email (no shared passwords)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={createClientAccount}
          disabled={creating}
          className="w-full shadow-glow"
        >
          {creating ? (
            "Creating Account..."
          ) : (
            <>
              <UserPlus className="h-4 w-4 mr-2" />
              Create Client Account
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          The client will be prompted to change their password upon first login.
        </p>
        {secondaryUsersSummary}
      </CardContent>
    </Card>
  );
};

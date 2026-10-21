import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CredentialsLockerProps {
  clientProfileId: string;
  initialCredentials?: string | null;
}

interface CredentialEntry {
  account: string;
  login: string;
  password: string;
}

export const CredentialsLocker = ({ clientProfileId, initialCredentials }: CredentialsLockerProps) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);

  // Load credentials via server-side decryption on unlock
  const loadDecryptedCredentials = async () => {
    try {
      const { data, error } = await supabase.rpc("decrypt_credentials", {
        p_client_profile_id: clientProfileId,
      });
      if (error) throw error;
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          setCredentials(parsed);
        }
      }
    } catch {
      // If decryption fails, start with empty
      setCredentials([]);
    }
  };

  const [newEntry, setNewEntry] = useState<CredentialEntry>({
    account: "",
    login: "",
    password: ""
  });

  const handleUnlockClick = () => {
    setShowPasswordDialog(true);
  };

  const verifyPassword = async () => {
    setVerifying(true);
    try {
      // Verify password by attempting to sign in with current user's credentials
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error("User not found");
        return;
      }

      // Attempt to verify the password using signInWithPassword
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: adminPassword
      });

      if (error) {
        toast.error("Incorrect password");
        setAdminPassword("");
        return;
      }

      // Password is correct - load credentials from server
      await loadDecryptedCredentials();
      setIsUnlocked(true);
      setShowPasswordDialog(false);
      setAdminPassword("");
      toast.success("Credentials locker unlocked");
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleAddCredential = () => {
    if (!newEntry.account || !newEntry.login || !newEntry.password) {
      toast.error("Please fill in all fields");
      return;
    }

    setCredentials([...credentials, { ...newEntry }]);
    setNewEntry({ account: "", login: "", password: "" });
    toast.success("Credential added");
  };

  const handleRemoveCredential = (index: number) => {
    setCredentials(credentials.filter((_, i) => i !== index));
    toast.success("Credential removed");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const credentialsJson = JSON.stringify(credentials);
      
      const { error } = await supabase.rpc("encrypt_credentials", {
        p_client_profile_id: clientProfileId,
        p_credentials_json: credentialsJson,
      });

      if (error) throw error;
      
      toast.success("Credentials saved securely");
    } catch (error: any) {
      toast.error(error.message || "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isUnlocked ? (
              <Unlock className="h-5 w-5 text-success" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            Credentials Locker
            <span className="text-xs text-muted-foreground font-normal ml-2">
              (Admin use only — securely store client logins here)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isUnlocked ? (
            <div className="text-center py-8">
              <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                This section is locked. Enter your admin password to access.
              </p>
              <Button onClick={handleUnlockClick} className="shadow-glow">
                <Lock className="h-4 w-4 mr-2" />
                Unlock Credentials
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Saved Credentials */}
              {credentials.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base">Saved Credentials</Label>
                  {credentials.map((cred, index) => (
                    <Card key={index} className="bg-muted/50">
                      <CardContent className="pt-4">
                        <div className="grid gap-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground">Account</p>
                              <p className="font-medium">{cred.account}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCredential(index)}
                              className="text-destructive hover:text-destructive h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Login</p>
                            <p className="font-medium break-all">{cred.login}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Password</p>
                            <p className="font-mono text-sm break-all">{cred.password}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add New Credential */}
              <div className="space-y-4 pt-4 border-t">
                <Label className="text-base">Add New Credential</Label>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="account">Account</Label>
                    <Input
                      id="account"
                      type="text"
                      value={newEntry.account}
                      onChange={(e) => setNewEntry({ ...newEntry, account: e.target.value })}
                      placeholder="e.g., Close CRM, Calendly, Slack"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login">Login</Label>
                    <Input
                      id="login"
                      type="text"
                      value={newEntry.login}
                      onChange={(e) => setNewEntry({ ...newEntry, login: e.target.value })}
                      placeholder="Username or email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="text"
                      value={newEntry.password}
                      onChange={(e) => setNewEntry({ ...newEntry, password: e.target.value })}
                      placeholder="Enter password"
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleAddCredential}
                  variant="outline"
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Credential
                </Button>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={handleSave} disabled={saving} className="shadow-glow flex-1">
                  {saving ? "Saving..." : "Save All Credentials"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsUnlocked(false)}
                >
                  Lock
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Admin Password</DialogTitle>
            <DialogDescription>
              Enter your admin password to unlock the credentials locker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
                placeholder="Enter your password"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowPasswordDialog(false);
                  setAdminPassword("");
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={verifyPassword} 
                disabled={verifying || !adminPassword}
                className="shadow-glow"
              >
                {verifying ? "Verifying..." : "Unlock"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

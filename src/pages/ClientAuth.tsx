import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Loader2, Mail, Lock, ArrowRight, User, Eye, EyeOff } from "lucide-react";
import logoMark from "@/assets/vexon-mark.svg";
import logoWhite from "@/assets/vexon-logo-white.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";

const ClientAuth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forgotSending, setForgotSending] = useState(false);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      if (session.user.user_metadata?.requires_password_change) {
        setShowPasswordReset(true);
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      
      if (roles?.role === "client") {
        navigate("/client/dashboard");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail.includes("@")) {
      toast.info("Type your email address above first, then press Forgot password");
      return;
    }
    setForgotSending(true);
    try {
      await supabase.functions.invoke("client-password-reset", { body: { email: loginEmail } });
    } catch {
      // The endpoint always answers generically — so do we.
    } finally {
      setForgotSending(false);
      toast.success("If that email has an account, a reset link is on its way — check your inbox.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) throw error;
      
      if (data.user) {
        if (loginPassword === "client123" || loginPassword === "temppassword123!") {
          setShowPasswordReset(true);
          toast.info("Please change your password to continue");
          return;
        }

        if (data.user.user_metadata?.requires_password_change) {
          setShowPasswordReset(true);
          toast.info("Please change your password to continue");
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        if (roles?.role === "client") {
          toast.success("Logged in successfully");
          navigate("/client/dashboard");
        } else {
          await supabase.auth.signOut();
          toast.error("This portal is for clients only. If you are a team member, please use the Team Portal.");
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword === "client123" || newPassword === "temppassword123!") {
      toast.error("Please choose a different password");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { requires_password_change: false }
      });

      if (updateError) throw updateError;

      toast.success("Password updated successfully");
      setShowPasswordReset(false);
      setNewPassword("");
      setConfirmPassword("");

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.requires_profile_completion) {
        setShowProfileCompletion(true);
      } else {
        navigate("/client/dashboard");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileCompletion = async () => {
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      toast.error("Please enter your first and last name");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fullName = `${profileFirstName.trim()} ${profileLastName.trim()}`;

      await supabase.from("profiles").update({
        full_name: fullName,
        phone: profilePhone.trim() || null,
      }).eq("id", user.id);

      await supabase.auth.updateUser({
        data: { requires_profile_completion: false, full_name: fullName }
      });

      toast.success("Profile completed!");
      setShowProfileCompletion(false);
      navigate("/client/dashboard");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-client min-h-screen flex relative overflow-hidden bg-background">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="auth-grid" />
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      {/* Left brand panel — animated mesh in the brand colours */}
      <div className="auth-brand-panel w-1/2">
        <div aria-hidden className="auth-mesh" />
        <div aria-hidden className="auth-mesh auth-mesh-2" />
        <div className="relative flex flex-col items-center justify-center px-12 xl:px-20 text-center space-y-8 max-w-xl">
          <div className="auth-mark-tile" style={{ animation: 'fade-in 0.6s ease-out' }}>
            <span aria-hidden className="auth-mark-glow" />
            <img src={logoMark} alt="" className="h-14 w-auto object-contain" />
          </div>

          <h1 className="m-0 flex justify-center" style={{ animation: 'fade-in 0.6s ease-out 0.1s both' }}>
            <img src={logoWhite} alt="Vexon OS" className="h-12 xl:h-14 w-auto object-contain drop-shadow-[0_12px_30px_rgba(15,15,17,0.3)]" />
          </h1>

          <div className="space-y-4" style={{ animation: 'fade-in 0.6s ease-out 0.3s both' }}>
            <span className="auth-portal-chip">Client Portal</span>
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div 
            className="text-center mb-10 space-y-4 lg:hidden"
            style={{ animation: 'fade-in 0.5s ease-out' }}
          >
            <div className="flex justify-center">
              <img src={logoGradient} alt="Vexon OS" className="h-12 w-auto object-contain dark:hidden" />
              <img src={logoWhite} alt="Vexon OS" className="hidden h-12 w-auto object-contain dark:block" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold rr-gradient-text">
                Vexon OS
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Client Portal</p>
            </div>
          </div>

          {/* Login card */}
          <div 
            className="auth-glass-card p-8 md:p-10"
            style={{ animation: 'fade-in 0.5s ease-out 0.2s both' }}
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center gap-2.5 mb-2">
                <div className="auth-title-icon">
                  <Users className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-heading font-bold text-foreground">Welcome Back</h2>
              </div>
              <p className="text-sm text-muted-foreground">Sign in to access your client dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium text-foreground/80">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="client@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="pl-10 auth-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm font-medium text-foreground/80">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="pl-10 pr-10 auth-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="auth-button">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotSending}
                className="block mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {forgotSending ? "Sending reset link…" : "Forgot password?"}
              </button>
            </form>

            {/* Portal switcher */}
            <div className="mt-6 pt-5 border-t border-border/50">
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200 group"
              >
                <span>Team Member?</span>
                <span className="rr-gradient-text font-semibold">Go to Team Portal</span>
                <ArrowRight className="w-4 h-4 text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <p 
            className="text-center text-xs text-muted-foreground/50 mt-6"
            style={{ animation: 'fade-in 0.5s ease-out 0.4s both' }}
          >
            © {new Date().getFullYear()} Vexon Systems. All rights reserved.
          </p>
        </div>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordReset} onOpenChange={(open) => !loading && setShowPasswordReset(open)}>
        <DialogContent className="auth-glass-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Change Your Password</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              For security reasons, please change your password before continuing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium text-foreground/80">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  disabled={loading}
                  minLength={6}
                  className="pl-10 auth-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground/80">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordReset()}
                  className="pl-10 auth-input"
                />
              </div>
            </div>
            <Button 
              onClick={handlePasswordReset} 
              disabled={loading || !newPassword || !confirmPassword}
              className="auth-button"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Completion Dialog */}
      <Dialog open={showProfileCompletion} onOpenChange={(open) => !loading && setShowProfileCompletion(open)}>
        <DialogContent className="auth-glass-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Complete Your Profile</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Please enter your details to finish setting up your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">First Name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  type="text"
                  value={profileFirstName}
                  onChange={(e) => setProfileFirstName(e.target.value)}
                  placeholder="Enter your first name"
                  disabled={loading}
                  className="pl-10 auth-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">Last Name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  type="text"
                  value={profileLastName}
                  onChange={(e) => setProfileLastName(e.target.value)}
                  placeholder="Enter your last name"
                  disabled={loading}
                  className="pl-10 auth-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">Mobile Number</Label>
              <div className="relative">
                <Input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="Enter your mobile number"
                  disabled={loading}
                  className="auth-input"
                />
              </div>
            </div>
            <Button 
              onClick={handleProfileCompletion} 
              disabled={loading || !profileFirstName || !profileLastName}
              className="auth-button"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Complete Setup"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientAuth;
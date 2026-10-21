import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Loader2, Mail, Lock, ArrowRight, BarChart3, Users, Zap, TrendingUp, Eye, EyeOff } from "lucide-react";
import logoMark from "@/assets/vexon-mark.svg";
import logoWhite from "@/assets/vexon-logo-white.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { loginFormSchema, passwordResetSchema } from "@/lib/validation";

const UnifiedAuth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [resetErrors, setResetErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});

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
        .eq("user_id", session.user.id);

      if (roles && roles.length > 0) {
        const userRole = roles[0].role;
        navigateToDashboard(userRole);
      }
    }
  };

  const navigateToDashboard = (role: string) => {
    if (role === 'csm') {
      navigate("/csm");
    } else if (role === 'admin') {
      navigate("/admin/ceo/projects");
    } else if (role === 'dev') {
      navigate("/admin");
    } else if (['ops', 'finance', 'account_executive'].includes(role)) {
      navigate("/admin");
    } else if (role === 'setter') {
      navigate("/setter");
    } else if (role === 'client') {
      navigate("/client");
    } else {
      navigate("/admin/ceo/projects");
    }
  };

  const handlePasswordReset = async () => {
    const result = passwordResetSchema.safeParse({
      newPassword,
      confirmPassword,
    });

    if (!result.success) {
      const fieldErrors: { newPassword?: string; confirmPassword?: string } = {};
      result.error.issues.forEach((err) => {
        if (err.path[0] === "newPassword") fieldErrors.newPassword = err.message;
        if (err.path[0] === "confirmPassword") fieldErrors.confirmPassword = err.message;
      });
      setResetErrors(fieldErrors);
      return;
    }

    if (newPassword === "client123") {
      toast.error("Please choose a different password");
      return;
    }

    setLoading(true);
    setResetErrors({});
    
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
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (roles && roles.length > 0) {
          navigateToDashboard(roles[0].role);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = loginFormSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.issues.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        if (err.path[0] === "password") fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    
    setLoading(true);
    setErrors({});

    const timeout = setTimeout(() => {
      console.warn('[UnifiedAuth] Login timeout hit');
      setLoading(false);
      toast.error('Login is taking longer than expected. Please try again.');
    }, 15000);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      console.log('[UnifiedAuth] signInWithPassword result', { hasUser: !!data?.user, error });

      if (error) throw error;

      if (data.user) {
        if (password === "client123" || data.user.user_metadata?.requires_password_change) {
          setShowPasswordReset(true);
          toast.info("Please change your password to continue");
          setLoading(false);
          clearTimeout(timeout);
          return;
        }

        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);

        console.log('[UnifiedAuth] roles loaded', roles, rolesError);

        if (rolesError) {
          await supabase.auth.signOut();
          toast.error("Error checking account permissions. Please try again.");
          return;
        }

        if (!roles || roles.length === 0) {
          await supabase.auth.signOut();
          toast.error("No role assigned to this account. Please contact an administrator.");
          return;
        }

        const nonClientRole = roles.find(r => r.role !== 'client');
        
        if (!nonClientRole) {
          await supabase.auth.signOut();
          toast.error("This portal is for team members only. Please use the Client Portal to sign in.");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.user.id)
          .maybeSingle();
        
        const firstName = profile?.full_name?.split(' ')[0];
        toast.success(firstName ? `Welcome back, ${firstName}!` : "Login successful!");
        navigateToDashboard(nonClientRole.role);
      }
    } catch (error: any) {
      console.error('[UnifiedAuth] Login error', error);
      if (error.message?.includes('banned') || error.message?.includes('User is banned')) {
        toast.error("Your account has been deactivated. Please contact an administrator to regain access.");
      } else {
        toast.error(error.message || "Login failed");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const features = [
    { icon: BarChart3, label: "Real-Time Analytics" },
    { icon: Users, label: "Team Management" },
    { icon: Zap, label: "Automated Workflows" },
    { icon: TrendingUp, label: "Performance Tracking" },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="auth-grid" />
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      {/* Left brand panel */}
      <div className="auth-brand-panel w-1/2">
        {/* Scanline sweep */}
        

        <div className="relative z-10 flex flex-col items-center justify-center px-12 xl:px-20 text-center space-y-10 max-w-xl">
          {/* Brand logo with HUD rings */}
          <div 
            className="relative group"
            style={{ animation: 'fade-in 0.6s ease-out' }}
          >
            <div className="auth-rings" />
            
            <div className="absolute inset-0 rounded-3xl blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-700 bg-primary/40" />
            <img src={logoMark} alt="" className="relative h-24 xl:h-28 w-auto object-contain transition-all duration-500 group-hover:scale-105" />
          </div>

          {/* Brand text */}
          <div className="space-y-4" style={{ animation: 'fade-in 0.6s ease-out 0.1s both' }}>
            <h1 className="m-0 flex justify-center">
              <img src={logoWhite} alt="Vexon OS" className="h-12 xl:h-14 w-auto object-contain drop-shadow-[0_10px_30px_rgba(107,122,144,0.35)]" />
            </h1>
            <p className="text-base xl:text-lg text-white/50 font-light max-w-xs mx-auto leading-relaxed tracking-wide uppercase" style={{ letterSpacing: '0.15em', fontSize: '0.8rem' }}>
              The operating system for high-performance SDR teams
            </p>
          </div>

          {/* Feature pills */}
          <div 
            className="flex flex-wrap justify-center gap-3"
            style={{ animation: 'fade-in 0.6s ease-out 0.3s both' }}
          >
            {features.map((feature, i) => (
              <div key={i} className="auth-feature-pill" style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
                <feature.icon className="w-4 h-4" />
                <span>{feature.label}</span>
              </div>
            ))}
          </div>

          {/* Testimonial / value prop */}
          <div 
            className="max-w-sm mx-auto space-y-3"
            style={{ animation: 'fade-in 0.6s ease-out 0.5s both' }}
          >
            <div className="auth-stat-card !p-6">
              <p className="text-sm text-white/70 italic leading-relaxed">
                "The operating system that keeps every SDR, AE, and manager aligned — from first dial to closed deal."
              </p>
              <p className="text-xs text-white/40 mt-3">— Built for high-performance teams</p>
            </div>
          </div>
        </div>

      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile logo (hidden on desktop where brand panel shows) */}
          <div 
            className="text-center mb-10 space-y-4 lg:hidden"
            style={{ animation: 'fade-in 0.5s ease-out' }}
          >
            <div className="flex justify-center">
              <img src={logoGradient} alt="Vexon OS" className="h-12 w-auto object-contain dark:hidden" />
              <img src={logoWhite} alt="Vexon OS" className="hidden h-12 w-auto object-contain dark:block" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold bg-gradient-to-r from-primary via-primary to-primary bg-clip-text text-transparent">
                Vexon OS
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Team Portal</p>
            </div>
          </div>

          {/* Login card */}
          <div 
            className="auth-glass-card auth-corner-brackets p-8 md:p-10"
            style={{ animation: 'fade-in 0.5s ease-out 0.2s both' }}
          >
            <span className="bracket-tr" />
            <span className="bracket-bl" />
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center gap-2.5 mb-2">
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-2xl font-heading font-bold text-foreground">Team Sign In</h2>
              </div>
              <p className="text-sm text-muted-foreground">For Admins and Team Members</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground/80">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@meridiansales.example"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    className={`pl-10 auth-input ${errors.email ? "border-destructive" : ""}`}
                    required
                  />
                </div>
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground/80">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    className={`pl-10 pr-10 auth-input ${errors.password ? "border-destructive" : ""}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
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
            </form>

            {/* Portal switcher */}
            <div className="mt-6 pt-5 border-t border-border/50">
              <button
                onClick={() => navigate("/client-login")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200 group"
              >
                <span>Client?</span>
                <span className="text-primary font-medium">Go to Client Portal</span>
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
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (resetErrors.newPassword) setResetErrors((prev) => ({ ...prev, newPassword: undefined }));
                  }}
                  placeholder="Min 8 chars with uppercase, lowercase & number"
                  disabled={loading}
                  className={`pl-10 auth-input ${resetErrors.newPassword ? "border-destructive" : ""}`}
                />
              </div>
              {resetErrors.newPassword && <p className="text-sm text-destructive">{resetErrors.newPassword}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground/80">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (resetErrors.confirmPassword) setResetErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
                  placeholder="Confirm new password"
                  disabled={loading}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordReset()}
                  className={`pl-10 auth-input ${resetErrors.confirmPassword ? "border-destructive" : ""}`}
                />
              </div>
              {resetErrors.confirmPassword && <p className="text-sm text-destructive">{resetErrors.confirmPassword}</p>}
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
    </div>
  );
};

export default UnifiedAuth;
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import logoMark from "@/assets/vexon-mark.svg";
import logoWhite from "@/assets/vexon-logo-white.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { ACTING_HOME, readStoredActingAs } from "@/lib/actingAs";

const Index = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  const consumeNext = (): string | null => {
    try {
      const raw = new URLSearchParams(window.location.search).get("next");
      if (!raw) return null;
      // Only allow same-origin relative paths.
      if (!raw.startsWith("/") || raw.startsWith("//")) return null;
      return raw;
    } catch {
      return null;
    }
  };

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const next = consumeNext();
      if (next) {
        window.location.replace(next);
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      if (roles && roles.length > 0) {
        const nonClientRole = roles.find(r => r.role !== 'client' && r.role !== 'partner');
        if (nonClientRole) {
          navigateToDashboard(nonClientRole.role, roles.map(r => r.role), session.user.id);
        }
      }
    }
  };

  /**
   * Acting-as (3 Sep): an admin/dev with a persisted hat lands on that role's
   * home rather than the CEO dashboard, so a refresh on "/" or a fresh login
   * keeps them in the portal they were auditing. Only admin/dev may hold a
   * hat; a stale key on any other account is ignored.
   */
  const actingHomeFor = (allRoles: string[], userId: string): string | null => {
    const entitled = allRoles.includes('admin') || allRoles.includes('dev');
    if (!entitled) return null;
    const hat = readStoredActingAs(userId);
    return hat ? ACTING_HOME[hat] : null;
  };

  const navigateToDashboard = (role: string, allRoles: string[] = [role], userId?: string) => {
    const actingHome = userId ? actingHomeFor(allRoles, userId) : null;
    if (actingHome) {
      navigate(actingHome);
      return;
    }
    if (role === 'csm') {
      navigate("/csm");
    } else if (role === 'sdr_manager') {
      navigate("/sdr-manager");
    } else if (role === 'gtm_engineer') {
      navigate("/gtm");
    } else if (role === 'ops_assistant') {
      navigate("/ops-assistant");
    } else if (role === 'admin') {
      navigate("/admin/ceo/projects");
    } else if (role === 'dev') {
      navigate("/admin");
    } else if (['ops', 'finance', 'account_executive', 'hr', 'accounting'].includes(role)) {
      navigate("/admin");
    } else if (role === 'setter') {
      navigate("/setter");
    } else if (role === 'trialist') {
      navigate("/trial");
    } else {
      navigate("/admin/ceo/projects");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Index] handleLogin start');
    setLoading(true);

    const timeout = setTimeout(() => {
      console.warn('[Index] Login timeout hit');
      setLoading(false);
      toast.error('Login is taking longer than expected. Please try again.');
    }, 15000);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[Index] signInWithPassword result', { hasUser: !!data?.user, error });

      if (error) throw error;
      
      if (data.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);

        console.log('[Index] roles loaded', roles);

        if (!roles || roles.length === 0) {
          await supabase.auth.signOut();
          toast.error("No role assigned. Please contact an administrator.");
          return;
        }

        const nonClientRole = roles.find(r => r.role !== 'client' && r.role !== 'partner');

        if (!nonClientRole) {
          await supabase.auth.signOut();
          toast.error("This portal is for team members only. Please use the Client or Partnerships Portal.");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", data.user.id)
          .maybeSingle();
        
        const firstName = profile?.full_name?.split(' ')[0];
        toast.success(firstName ? `Welcome back, ${firstName}!` : "Welcome back!");
        const next = consumeNext();
        if (next) {
          window.location.replace(next);
          return;
        }
        navigateToDashboard(nonClientRole.role, roles.map(r => r.role), data.user.id);
      }
    } catch (error: any) {
      console.error('[Index] Login error', error);
      toast.error(error.message || 'Login failed');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      console.log('[Index] handleLogin end');
    }
  };

  return (
    <div className="auth-team min-h-screen flex relative overflow-hidden bg-background">
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
            <img src={logoWhite} alt="Vexon OS" className="h-10 xl:h-12 w-auto object-contain" />
          </h1>

          <div className="space-y-4" style={{ animation: 'fade-in 0.6s ease-out 0.3s both' }}>
            <span className="auth-portal-chip">Team Portal</span>
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
              <h1 className="text-2xl font-heading font-bold rr-gradient-text">
                Vexon OS
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Team Portal</p>
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
                  <Shield className="w-5 h-5" />
                </div>
                <h2 className="font-head text-[24px] font-medium tracking-[-0.02em] text-foreground">Welcome back</h2>
              </div>
              <p className="text-sm text-muted-foreground">Sign in to access your team dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground/80">Email</Label>
                <div className="relative">
                                    <Input
                    id="email"
                    type="email"
                    placeholder="you@meridiansales.example"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground/80">Password</Label>
                <div className="relative">
                                    <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-8 auth-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="auth-button"
              >
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
                onClick={() => navigate("/client")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200 group"
              >
                <span>Client?</span>
                <span className="font-semibold text-[var(--accent)]">Go to Client Portal</span>
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
    </div>
  );
};

export default Index;
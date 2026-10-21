import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Loader2, Mail, Lock } from "lucide-react";
import logoTile from "@/assets/vexon-mark-tile.svg";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await redirectBasedOnRole(session.user.id);
    }
  };

  const redirectBasedOnRole = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!roles || roles.length === 0) {
      toast.error("No role assigned. Contact administrator.");
      return;
    }

    const nonClientRole = roles.find(r => r.role !== 'client');
    const role = nonClientRole?.role || roles[0]?.role;

    if (role === 'csm') {
      navigate("/csm");
    } else if (role === 'sdr_manager') {
      navigate("/sdr-manager");
    } else if (role === 'setter') {
      navigate("/setter");
    } else if (role === 'client') {
      navigate("/client/dashboard");
    } else if (['admin', 'dev', 'ops', 'finance', 'account_executive', 'hr', 'accounting'].includes(role)) {
      navigate("/admin");
    } else {
      navigate("/admin");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (data.user) {
        await redirectBasedOnRole(data.user.id);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-glow" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and branding */}
        <div className="text-center mb-10 space-y-6" style={{ animation: 'fade-in 0.5s ease-out' }}>
          <div className="flex justify-center">
            <div className="relative group">
              <div 
                className="absolute inset-0 rounded-[2rem] blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700"
                style={{ background: 'var(--gradient-brand)' }}
              />
              <img src={logoTile} alt="Vexon OS" className="relative h-24 w-24 md:h-28 md:w-28 object-contain transition-all duration-500 group-hover:scale-105" />
            </div>
          </div>

          <div className="space-y-2" style={{ animation: 'fade-in 0.5s ease-out 0.1s both' }}>
            <h1 className="text-3xl md:text-4xl font-heading font-bold bg-gradient-to-r from-primary via-primary-soft to-primary bg-clip-text text-transparent">
              Vexon OS
            </h1>
            <p className="text-xl md:text-2xl font-heading font-semibold text-foreground">
              Team Portal
            </p>
            <p className="text-sm text-muted-foreground tracking-wide">Revenue operations, one system</p>
          </div>
        </div>

        {/* Login card */}
        <div 
          className="glass-card p-8 relative overflow-hidden"
          style={{ animation: 'fade-in 0.5s ease-out 0.2s both' }}
        >
          <div 
            className="absolute inset-0 rounded-[18px] p-px pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.3), transparent 50%, hsl(var(--accent-primary-soft) / 0.12))'
            }}
          />
          
          <div className="relative">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-heading font-semibold text-foreground">Sign In</h2>
              </div>
              <p className="text-sm text-muted-foreground">Welcome back to Vexon OS</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground/80">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 auth-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground/80">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10 auth-input"
                  />
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
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;

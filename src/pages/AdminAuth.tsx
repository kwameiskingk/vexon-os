import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Loader2, Mail, Lock, User, ArrowLeft } from "lucide-react";
import logoTile from "@/assets/vexon-mark-tile.svg";

const AdminAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");
  
  const [loading, setLoading] = useState(false);
  const [validInvite, setValidInvite] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(true);
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    checkUser();
    if (inviteCode) {
      validateInvite();
    } else {
      setCheckingInvite(false);
    }
  }, [inviteCode]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      
      if (roles?.role === "admin") {
        navigate("/admin/ceo/projects");
      }
    }
  };

  const validateInvite = async () => {
    if (!inviteCode) {
      setCheckingInvite(false);
      return;
    }

    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .eq("invite_code", inviteCode)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (data && !error) {
      setValidInvite(true);
      setSignupEmail(data.invited_email);
    }
    setCheckingInvite(false);
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
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        if (roles?.role === "admin") {
          navigate("/admin/ceo/projects");
        } else {
          toast.error("Access denied. Admin role required.");
          await supabase.auth.signOut();
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validInvite) {
      toast.error("Valid invite required to create admin account");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });

      if (error) throw error;
      
      if (data.user) {
        await supabase.from("user_roles").insert({
          user_id: data.user.id,
          role: "admin",
        });

        if (inviteCode) {
          await supabase
            .from("invites")
            .update({ 
              used_at: new Date().toISOString(),
              used_by: data.user.id 
            })
            .eq("invite_code", inviteCode);
        }

        toast.success("Admin account created successfully!");
        navigate("/admin/ceo/projects");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingInvite) {
    return (
      <div className="auth-container">
        <div className="auth-glow" />
        <div className="relative z-10 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Validating invite...</span>
        </div>
      </div>
    );
  }

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
              Admin Portal
            </p>
            <p className="text-sm text-muted-foreground tracking-wide">Restricted Access</p>
          </div>
        </div>

        {/* Login card */}
        <div 
          className="glass-card relative overflow-hidden"
          style={{ animation: 'fade-in 0.5s ease-out 0.2s both' }}
        >
          <div 
            className="absolute inset-0 rounded-[18px] p-px pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.3), transparent 50%, hsl(var(--accent-primary-soft) / 0.12))'
            }}
          />
          
          <div className="relative p-8">
            <Tabs defaultValue={validInvite ? "signup" : "login"}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup" disabled={!validInvite}>Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium text-foreground/80">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="admin@example.com"
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
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
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
                      "Sign In as Admin"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                {!validInvite ? (
                  <div className="text-center py-8 space-y-4">
                    <p className="text-muted-foreground">
                      Access restricted. Admin signup requires a valid invite link.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Please request an admin invite from an existing administrator.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSignup} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name" className="text-sm font-medium text-foreground/80">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder="John Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                          className="pl-10 auth-input"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-sm font-medium text-foreground/80">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                          id="signup-email"
                          type="email"
                          value={signupEmail}
                          disabled
                          className="pl-10 auth-input"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="text-sm font-medium text-foreground/80">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <Input
                          id="signup-password"
                          type="password"
                          placeholder="••••••••"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          required
                          minLength={6}
                          className="pl-10 auth-input"
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={loading} className="auth-button">
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Admin Account"
                      )}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Back link */}
          <div className="px-8 pb-6 pt-2 border-t border-border/50">
            <button
              onClick={() => navigate("/")}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200 group"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAuth;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Target, Loader2, Mail, Lock, User, ArrowLeft } from "lucide-react";
import logoTile from "@/assets/vexon-mark-tile.svg";

const SetterAuth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      
      if (roles?.role === "setter") {
        navigate("/setter");
      }
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
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        if (roles?.role === "setter") {
          navigate("/setter");
        } else {
          toast.error("Setter role required. Please contact admin.");
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
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/setter`,
        },
      });

      if (error) throw error;
      
      if (data.user) {
        const { error: roleError } = await supabase.from("user_roles").insert({
          user_id: data.user.id,
          role: "setter",
        });

        if (roleError) throw roleError;

        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", data.user.id)
          .single();

        if (profile) {
          await supabase.from("setters_profiles").insert({
            user_id: data.user.id,
            email: profile.email,
            full_name: profile.full_name || fullName,
            active: true,
          });
        }

        toast.success("Setter account created successfully!");
        navigate("/setter");
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
              Setter Portal
            </p>
            <p className="text-sm text-muted-foreground tracking-wide">For Setters Only</p>
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
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
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
                        placeholder="setter@example.com"
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
                      "Sign In as Setter"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
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
                        placeholder="setter@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
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
                      "Create Setter Account"
                    )}
                  </Button>
                </form>
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

export default SetterAuth;

import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Linkedin, Target, ArrowLeftRight, LogOut, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setJamesMode } from "@/lib/coldOutbound";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/marketing", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/marketing/leads", label: "Leads", icon: Target },
  { to: "/marketing/linkedin", label: "LinkedIn", icon: Linkedin },
];

export const MarketingLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const switchToSetter = () => {
    setJamesMode("setter");
    navigate("/setter");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex w-full bg-background relative overflow-hidden">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.55]">
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-orange-500/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full bg-amber-500/15 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-rose-500/10 blur-[120px]" />
      </div>

      {/* Sidebar */}
      <aside className="relative z-10 w-60 shrink-0 border-r border-white/[0.06] flex flex-col backdrop-blur-xl"
             style={{ background: "linear-gradient(180deg, hsl(24 95% 53% / 0.10) 0%, hsl(var(--sidebar-background) / 0.85) 45%)" }}>
        <div className="h-[69px] border-b border-white/[0.06] px-4 flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/40 ring-1 ring-white/20">
            <Zap className="h-4 w-4 text-white drop-shadow" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.18em] text-orange-400 font-semibold">Workspace</div>
            <div className="text-sm font-bold bg-gradient-to-r from-orange-300 to-amber-200 bg-clip-text text-transparent">Marketing Hub</div>
          </div>
        </div>

        <div className="px-3 py-3 border-b border-white/[0.05]">
          <button
            onClick={switchToSetter}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all text-xs font-medium backdrop-blur-sm"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Switch to Setter View
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60 px-3 mb-1.5 font-medium">
            Navigation
          </div>
          {nav.map((item) => {
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all relative",
                  active
                    ? "bg-gradient-to-r from-orange-500/20 via-orange-500/10 to-transparent text-foreground font-semibold shadow-[inset_0_0_0_1px_hsl(24_95%_53%/0.25)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                )}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-gradient-to-b from-orange-400 to-amber-500" />}
                <item.icon className={cn("h-4 w-4 stroke-[1.75] transition-transform group-hover:scale-110", active && "text-orange-400")} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.05] p-2 space-y-0.5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all"
          >
            <LogOut className="h-4 w-4 stroke-[1.75]" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className="h-[65px] border-b border-white/[0.06] px-4 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-20 backdrop-blur-2xl bg-background/60">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500/15 to-amber-500/10 border border-orange-500/30 shadow-sm shadow-orange-500/10">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">Marketing Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="w-full px-3 sm:px-5 py-5 space-y-6 animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
};

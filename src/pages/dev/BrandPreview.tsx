// /dev/brand-preview — Meridian round 2 design-system sheet. Dev-only. Renders
// every brand primitive (buttons, tiles, badges, progress, toggles, tabs,
// dialog, toast, avatars, empty state) plus one block per department so the
// accent system can be eyeballed in both themes without clicking through
// the app. No data, no auth hooks — pure presentation.

import { CSSProperties, useState } from "react";
import "@/styles/dev-console.css";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  BarChart3, Bell, Briefcase, Calendar, Check, Inbox, LayoutDashboard, Loader2, Moon, Plus,
  Rocket, Settings, Sparkles, Sun, Users, Activity, Ticket, Target, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { KPICard } from "@/components/dashboard/KPICard";
import { CEOKpiTile, CEOSectionEyebrow } from "@/components/ceo/CEOKpiTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { BRAND, DEPARTMENT_ORDER, DEPARTMENT_THEMES, departmentStyleVars, type DepartmentKey } from "@/lib/departmentTheme";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import logoWhite from "@/assets/vexon-logo-white.svg";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <span className="rr-eyebrow">{title}</span>
        {hint && <p className="mt-1 text-[12.5px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function NavSample({ dept }: { dept: DepartmentKey }) {
  const items = [
    { icon: LayoutDashboard, label: "Overview", active: true },
    { icon: Briefcase, label: "Pipeline", active: false },
    { icon: Calendar, label: "Meetings", active: false },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-sidebar p-2 space-y-0.5 w-full max-w-[220px]">
      <button type="button" className="rr-dept-switch mb-2">
        <span className="flex items-center gap-2"><span className="rr-dept-dot" />{DEPARTMENT_THEMES[dept].label}</span>
        <span className="text-muted-foreground text-xs">▾</span>
      </button>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={`${it.active ? "rr-nav-active" : "rr-nav-idle"} flex w-full items-center gap-2 px-2 py-2 text-sm`}
        >
          <it.icon className={`h-4 w-4 stroke-[1.75] ${it.active ? "" : "opacity-60"}`} />
          <span>{it.label}</span>
          {it.label === "Meetings" && <span className="ml-auto rr-badge-new">New</span>}
        </button>
      ))}
    </div>
  );
}

function DepartmentBlock({ dept }: { dept: DepartmentKey }) {
  const t = DEPARTMENT_THEMES[dept];
  const vars = departmentStyleVars(dept) as CSSProperties;
  return (
    <div data-dept={dept} style={vars} className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span className="rr-eyebrow">{t.label}</span>
          <h3 className="rr-title mt-1 text-lg font-heading font-semibold">{t.label} accent</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: t.accent }} title={`accent ${t.accent}`} />
          <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: t.ink }} title={`ink ${t.ink}`} />
          <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.blend})` }} title="rail" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <NavSample dept={dept} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CEOKpiTile label="Headline" value="1,284" delta={{ value: "+12% vs last", tone: "up" }} />
            <KPICard title="Progress to target" value={72} target={100} showProgress weight="primary" icon={BarChart3} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Primary</Button>
            <Button size="sm" variant="accent">Accent</Button>
            <Button size="sm" variant="outline">Outline</Button>
            <Badge variant="dept">Department badge</Badge>
            <span className="rr-chip-dept">{t.label}</span>
            <Progress value={64} className="w-40" />
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            accent {t.accent} · ink {t.ink} · text-primary <span className="text-primary font-semibold">looks like this</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BrandPreview() {
  const { resolvedTheme, setTheme } = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [on, setOn] = useState(true);
  const isDark = resolvedTheme !== "light";
  const ceoVars = departmentStyleVars("ceo") as CSSProperties;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="relative sticky top-0 z-20 h-[65px] border-b border-border/15 bg-background/80 backdrop-blur-xl px-6 flex items-center justify-between">
        <span aria-hidden className="rr-top-hairline" />
        <div className="flex items-center gap-3">
          <img src={isDark ? logoWhite : logoGradient} alt="Vexon OS" className="h-8 w-auto" />
          <span className="rr-chip-gradient">Brand preview · round 2</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Light mode" : "Dark mode"}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-12" data-dept="ceo" style={ceoVars}>
        <PageHeader
          eyebrow="Design system"
          title="Meridian identity, at rest"
          subtitle="The gradient is the identity: buttons, rails, tile edges, focus rings and progress use it without hover. Every department wears its own accent on top."
          actions={<Button><Sparkles className="h-4 w-4" /> Primary action</Button>}
        />

        {/* Brand */}
        <Section title="Brand gradient" hint="pink #dedede → lilac #9e9e9e → blue #6b7a90 at 135°. Deep stops for white text; pastel wash for hero cards.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="h-24 rounded-2xl" style={{ background: BRAND.gradient }} />
            <div className="h-24 rounded-2xl flex items-center justify-center text-white font-semibold" style={{ background: BRAND.gradientDeep }}>
              Deep — white text AA
            </div>
            <div className="rr-hero h-24 flex items-center justify-center font-semibold">Pastel hero — ink text</div>
          </div>
          <h2 className="rr-gradient-text text-4xl font-heading font-bold tracking-tight">Gradient headline</h2>
        </Section>

        {/* Department swatches */}
        <Section title="Department accents" hint="Bright accent (rails, dots, dark-mode primary) and AA ink variant (light-mode primary, small text on white).">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {DEPARTMENT_ORDER.map((k) => {
              const t = DEPARTMENT_THEMES[k];
              return (
                <div key={k} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                  <div className="h-14" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.blend})` }} />
                  <div className="p-3 space-y-1">
                    <p className="text-[12.5px] font-semibold">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{t.accent}</p>
                    <p className="text-[11px] font-mono font-semibold" style={{ color: t.ink }}>{t.ink} ink</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" hint="Default = gradient at rest. Hover brightens and lifts; active presses; focus shows the two-tone ring.">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button><Plus className="h-4 w-4" /> With icon</Button>
            <Button size="lg">Large</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
            <Button disabled><Loader2 className="h-4 w-4 animate-spin" /> Loading</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
            <Button size="icon"><Settings className="h-4 w-4" /></Button>
          </div>
        </Section>

        {/* Tiles */}
        <Section title="Tiles" hint="Accent top edge, tinted shadow, lift on hover. Numbers in the display weight.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <CEOKpiTile label="Sales" value="£48,200" delta={{ value: "6 deals closed", tone: "neutral" }} highlight />
            <CEOKpiTile
              label="Appointment setting"
              value="312"
              delta={{ value: "68.4% show-up", tone: "up" }}
              expanded
              onToggle={() => undefined}
              details={{ rationale: "Discos booked in the window.", rows: [{ label: "Sat", value: "213" }, { label: "No-show", value: "41" }] }}
            />
            <KPICard title="Dials today" value={1840} icon={BarChart3} trend={8} weight="primary" />
          </div>
        </Section>

        {/* Badges, chips, progress, toggles */}
        <Section title="Badges · chips · progress · toggles">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">New</Badge>
            <Badge variant="brand-soft">Brand soft</Badge>
            <Badge variant="dept">Department</Badge>
            <Badge>Default</Badge>
            <Badge variant="healthy">Healthy</Badge>
            <Badge variant="pending">Pending</Badge>
            <Badge variant="at_risk">At risk</Badge>
            <Badge variant="info">Info</Badge>
            <span className="rr-badge-new">New</span>
            <span className="rr-chip-gradient"><Rocket className="h-3 w-3" /> Launch</span>
            <span className="rr-chip-dept">CEO</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="space-y-2">
              <Progress value={35} />
              <Progress value={68} />
              <Progress value={92} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={on} onCheckedChange={setOn} />
              <Switch checked={!on} onCheckedChange={(v) => setOn(!v)} />
              <span className="text-sm text-muted-foreground">Toggle</span>
            </div>
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">Overview</TabsTrigger>
                <TabsTrigger value="b">Pipeline</TabsTrigger>
                <TabsTrigger value="c">Reports</TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="text-sm text-muted-foreground">Tab underline is the department gradient.</TabsContent>
              <TabsContent value="b" />
              <TabsContent value="c" />
            </Tabs>
          </div>
        </Section>

        {/* Inputs, avatars, empty state */}
        <Section title="Inputs · avatars · empty state">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="space-y-3">
              <Input placeholder="Focus me for the gradient ring" />
              <Input className="auth-input" placeholder="Auth input" />
            </div>
            <div className="flex items-center gap-3">
              <UserAvatar name="Marcus Hale" size="lg" ring />
              <UserAvatar name="Kofi Asante" size="lg" />
              <UserAvatar name="Daniel Okoro" size="md" />
              <span className="rr-avatar-ring"><UserAvatar name="Elena Varga" size="md" /></span>
            </div>
            <EmptyState icon={Inbox} title="Nothing here yet" description="Empty-state icons sit on the gradient tile." action={{ label: "Add one", onClick: () => toast.success("Added") }} />
          </div>
        </Section>

        {/* Section eyebrows, hero */}
        <Section title="Section eyebrows · hero">
          <CEOSectionEyebrow label="Departments at a glance" accent="indigo" trailing="live" />
          <div className="rr-hero px-6 py-5">
            <span className="rr-eyebrow">Client Portal</span>
            <h3 className="mt-1.5 text-[24px] font-heading font-semibold tracking-tight">Good morning, Acme Ltd</h3>
            <p className="mt-0.5 text-[13px] opacity-75">Your performance overview at a glance</p>
          </div>
        </Section>

        {/* Dialog + toast */}
        <Section title="Dialog · toast" hint="Dialog carries a gradient hairline; toasts get a gradient rail (green/red/gold for semantic types).">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="outline" onClick={() => toast("Saved to the plan", { description: "Default toast" })}>Toast</Button>
            <Button variant="outline" onClick={() => toast.success("Welcome back, the owner!")}>Success</Button>
            <Button variant="outline" onClick={() => toast.error("Login failed")}>Error</Button>
            <Button variant="outline" onClick={() => toast.warning("Migration pending")}>Warning</Button>
          </div>
          {/* Static render of the dialog + toast surfaces so screenshots show them without interaction */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="relative overflow-hidden rounded-2xl before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-brand">
              <CardContent className="p-6 space-y-3">
                <h3 className="text-lg font-semibold">Change your password</h3>
                <p className="text-sm text-muted-foreground">For security reasons, please change your password before continuing.</p>
                <Input placeholder="New password" type="password" />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm">Cancel</Button>
                  <Button size="sm">Update password</Button>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {[
                { rail: BRAND.gradient, title: "Saved to the plan", body: "Default toast", icon: Bell },
                { rail: "linear-gradient(180deg,#a9b4bf,#7d8a99)", title: "Welcome back, the owner!", body: "Signed in", icon: Check },
                { rail: "linear-gradient(180deg,#b0b0b5,#6e6e74)", title: "Login failed", body: "Check your password", icon: Users },
              ].map((t) => (
                <div key={t.title} className="relative overflow-hidden rounded-[14px] border border-border bg-background px-4 py-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)] flex items-center gap-3">
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.rail }} />
                  <t.icon className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* One block per department */}
        <Section title="Every department, its own colour" hint="Each block is a department scope: sidebar states, tiles, buttons and chips pick up the accent automatically.">
          <div className="grid grid-cols-1 gap-4">
            {DEPARTMENT_ORDER.map((k) => (
              <DepartmentBlock key={k} dept={k} />
            ))}
          </div>
        </Section>

        {/* Dev Centre mock — the console re-skin without needing the dev login */}
        <Section title="Dev Centre" hint="Static mock of /dev: ink surfaces, gradient rail, lilac mono labels, gradient chips, display-weight numbers. No grid background.">
          <div className="dev-console rounded-2xl overflow-hidden border border-border/40" style={{ minHeight: 0 }}>
            <div className="flex">
              <aside className="dc-rail w-56 border-r border-[var(--dc-border)] p-3 pl-4">
                <div className="mb-5 px-2 pt-2">
                  <img src={isDark ? logoWhite : logoGradient} alt="Vexon OS" className="h-6 w-auto object-contain mb-3" />
                  <p className="dc-mono text-[10px] tracking-[0.2em] text-[var(--dc-text-dim)] mb-1">[DEV CENTRE]</p>
                  <p className="dc-rail-title">MISSION<span className="dc-cursor" /></p>
                </div>
                <button type="button" className="dc-rail-btn mb-3"><ArrowLeft className="h-4 w-4" /><span>Exit</span></button>
                <nav className="space-y-1">
                  {[
                    { icon: Target, label: "Mandate" },
                    { icon: Activity, label: "Mission Control", active: true },
                    { icon: Ticket, label: "Tickets" },
                    { icon: Rocket, label: "Releases" },
                  ].map((m) => (
                    <button key={m.label} type="button" className={`dc-rail-btn ${m.active ? "active" : ""}`}>
                      <m.icon className="h-4 w-4" /><span>{m.label}</span>
                    </button>
                  ))}
                </nav>
              </aside>
              <div className="flex-1 p-6 space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] tracking-[0.2em]">[MODULE: MISSION]</p>
                    <h3 className="rr-title text-2xl mt-1 text-[var(--dc-text)] font-heading font-bold">Mission Control</h3>
                  </div>
                  <span className="dc-chip-gradient shrink-0">Meridian · engineering console</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[["Database", "142ms", "ok"], ["Auth", "online", "ok"], ["Errors 24h", "3", "warn"], ["Tickets open", "12", "info"]].map(([l, v, s]) => (
                    <div key={l} className="dc-surface dc-surface-accent p-3">
                      <p className="dc-label">{l}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`dc-dot dc-pill-${s}`} />
                        <span className="dc-mono text-base text-[var(--dc-text)]">{v}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dc-surface dc-surface-accent p-6 flex items-end justify-between gap-6" style={{ background: "linear-gradient(135deg, rgba(222,222,222,0.14), rgba(158,158,158,0.10), rgba(107,122,144,0.14))", borderColor: "rgba(158,158,158,0.35)" }}>
                  <div>
                    <p className="dc-mono text-[10px] tracking-[0.25em] text-[var(--dc-text-dim)]">[ HOURS SAVED / MONTH ]</p>
                    <p className="dc-metric-num dc-metric-gradient leading-none mt-2" style={{ fontSize: 64 }}>318.4<span className="dc-mono text-base text-[var(--dc-text-dim)] ml-3">hrs</span></p>
                  </div>
                  <div className="text-right">
                    <p className="dc-label">per week</p>
                    <p className="dc-metric-num" style={{ fontSize: 32 }}>74<span className="dc-mono text-xs text-[var(--dc-text-dim)] ml-2">hrs</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="dc-pill dc-pill-ok">Rolled out</span>
                  <span className="dc-pill dc-pill-warn">In progress</span>
                  <span className="dc-pill dc-pill-err">Blocked</span>
                  <span className="dc-pill dc-pill-info">Note</span>
                  <button type="button" className="dc-btn">Secondary</button>
                  <button type="button" className="dc-btn dc-btn-primary">Primary</button>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Brand dialog</DialogTitle>
            <DialogDescription>Gradient hairline on top, 16px radius, tinted shadow.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Type something" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { setDialogOpen(false); toast.success("Done"); }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

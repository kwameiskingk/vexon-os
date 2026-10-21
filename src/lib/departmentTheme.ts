// Department accents. Since the 14 Oct 2026 design system each department
// keeps its own colour, but that colour reaches ONE place: the dot in the
// sidebar's department switcher (`--dept`). It no longer recolours
// `--primary` / `--ring`; the accent (periwinkle dark / indigo light) is the
// same everywhere and the brand gradient (pink → lilac → blue) is the shared
// signature.
//
// DashboardLayout resolves the current department from the route and writes
// the `--dept-*` custom properties on the shell. index.css maps `--dept` from
// `--dept-accent`; the Tailwind `dept` colour reads `--dept-hsl`.

import type { Department } from "@/contexts/DepartmentContext";

export type DepartmentKey =
  | "ceo"
  | "ops_command"
  | "sales"
  | "operations"
  | "hr"
  | "client_health"
  | "finance"
  | "gtm"
  | "referrals"
  | "client"
  | "partner"
  | "dev";

export interface DepartmentTheme {
  key: DepartmentKey;
  label: string;
  /** Bright display accent (hex): the switcher dot. */
  accent: string;
  /** AA-safe darker variant (hex), kept for the few `text-dept-ink` uses. */
  ink: string;
  /** Companion colour (hex); no longer painted anywhere by the shell. */
  blend: string;
}

export const BRAND = {
  pink: "#dedede",
  lilac: "#9e9e9e",
  blue: "#6b7a90",
  mark: "#8a9bb0",
  /** The identity gradient (from the logo). */
  gradient: "linear-gradient(135deg, #dedede 0%, #9e9e9e 50%, #6b7a90 100%)",
  /** Deeper stops so white text passes AA on every part of a button. */
  gradientDeep: "linear-gradient(135deg, #8c8c8c 0%, #5a5a5a 50%, #3d5a80 100%)",
  /** Pastel wash (retired from the shell; kept for the brand preview). */
  gradientPastel: "linear-gradient(135deg, #ededf0 0%, #e8e8ea 50%, #e8ecf1 100%)",
} as const;

export const DEPARTMENT_THEMES: Record<DepartmentKey, DepartmentTheme> = {
  ceo: { key: "ceo", label: "CEO", accent: "#9e9e9e", ink: "#4a5d73", blend: "#6b7a90" },
  ops_command: { key: "ops_command", label: "Ops Command", accent: "#dedede", ink: "#8c8c8c", blend: "#9e9e9e" },
  sales: { key: "sales", label: "Sales", accent: "#6b7a90", ink: "#3d5a80", blend: "#9e9e9e" },
  operations: { key: "operations", label: "Operations", accent: "#a9b4bf", ink: "#4f5d6b", blend: "#6b7a90" },
  hr: { key: "hr", label: "HR & Hiring", accent: "#b8b8b8", ink: "#6e6e74", blend: "#dedede" },
  client_health: { key: "client_health", label: "Client Health", accent: "#b0b0b5", ink: "#6e6e74", blend: "#dedede" },
  finance: { key: "finance", label: "Finance", accent: "#7d8a99", ink: "#4f5d6b", blend: "#6b7a90" },
  gtm: { key: "gtm", label: "GTM", accent: "#5a5a5a", ink: "#454549", blend: "#dedede" },
  referrals: { key: "referrals", label: "Referrals", accent: "#a3a3a8", ink: "#6e6e74", blend: "#6b7a90" },
  client: { key: "client", label: "Client Portal", accent: "#6b7a90", ink: "#3d5a80", blend: "#9e9e9e" },
  partner: { key: "partner", label: "Partnerships", accent: "#dedede", ink: "#8c8c8c", blend: "#9e9e9e" },
  dev: { key: "dev", label: "Dev Centre", accent: "#9e9e9e", ink: "#5a5a5a", blend: "#6b7a90" },
};

/** Ordered list for swatch displays / the brand preview. */
export const DEPARTMENT_ORDER: DepartmentKey[] = [
  "ceo",
  "ops_command",
  "sales",
  "operations",
  "hr",
  "client_health",
  "finance",
  "gtm",
  "referrals",
  "client",
  "partner",
  "dev",
];

const SELECTED_DEPARTMENT_MAP: Record<Department, DepartmentKey> = {
  ceo: "ceo",
  ops_command: "ops_command",
  sales: "sales",
  operations: "operations",
  accounting: "finance",
  hr: "hr",
  gtm: "gtm",
};

/**
 * Which department a route belongs to. The path wins over the department
 * switcher because the CEO department's sub-tabs each belong to another
 * department (Sales, HR, Finance…).
 */
export function resolveDepartmentKey(
  pathname: string,
  selectedDepartment: Department | null | undefined,
  role?: "admin" | "setter" | "client" | "partner" | string,
): DepartmentKey {
  const p = pathname || "/";
  if (p.startsWith("/dev")) return "dev";
  if (p.startsWith("/client")) return "client";
  if (p.startsWith("/partnerships")) return "partner";
  if (p.startsWith("/ops-command")) return "ops_command";
  if (p.startsWith("/admin/ceo/")) {
    // 14 Oct 2026: only Referrals keeps its own colour; the metric tabs are gone.
    const tab = p.slice("/admin/ceo/".length).split("/")[0];
    return tab === "referrals" ? "referrals" : "ceo";
  }
  if (p.startsWith("/admin/hr")) return "hr";
  if (p.startsWith("/admin/accounting")) return "finance";
  if (p.startsWith("/admin/operations")) return "operations";
  if (p.startsWith("/csm")) return "client_health";
  if (p.startsWith("/ops-assistant")) return "operations";
  if (p.startsWith("/gtm") || p.startsWith("/marketing") || p.startsWith("/cold-outbound")) return "gtm";
  if (p.startsWith("/ae") || p.startsWith("/sdr-manager")) return "sales";
  if (p.startsWith("/setter") || p.startsWith("/demo/setter")) return "sales";
  if (p.startsWith("/demo/client")) return "client";
  if (p.startsWith("/ta")) return "hr";
  if (role === "client") return "client";
  if (role === "partner") return "partner";
  if (selectedDepartment && SELECTED_DEPARTMENT_MAP[selectedDepartment]) {
    return SELECTED_DEPARTMENT_MAP[selectedDepartment];
  }
  return "sales";
}

/** "#RRGGBB" → "h s% l%" (the triplet Tailwind's hsl(var(--x)) expects). */
export function hexToHslTriplet(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * CSS custom properties for a department scope. `--dept-accent` feeds the
 * switcher dot (`--dept`); `--dept-hsl` / `--dept-ink-hsl` feed the Tailwind
 * `dept` colour. The gradient variables stay on the brand gradient so the
 * handful of `bg-gradient-dept` consumers wear the signature, not a
 * department wash.
 */
export function departmentStyleVars(key: DepartmentKey): Record<string, string> {
  const t = DEPARTMENT_THEMES[key];
  return {
    "--dept-accent": t.accent,
    "--dept-ink": t.ink,
    "--dept-blend": t.blend,
    "--dept-hsl": hexToHslTriplet(t.accent),
    "--dept-ink-hsl": hexToHslTriplet(t.ink),
    "--gradient-dept": BRAND.gradient,
    "--gradient-dept-rail": "linear-gradient(180deg, #dedede 0%, #9e9e9e 50%, #6b7a90 100%)",
  };
}

export const departmentTheme = (key: DepartmentKey) => DEPARTMENT_THEMES[key];

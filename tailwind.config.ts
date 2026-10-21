import type { Config } from "tailwindcss";

// Design tokens (approved 14 Oct 2026) live as hex custom properties in
// src/index.css. The shadcn colour names below read the HSL mirrors of the
// same tokens; the `rr` group reads the hex tokens directly (no opacity
// modifiers on those). See ~/vexon-build/handovers/ui-pass/DESIGN_SPEC_2026-10-14.md.

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Bricolage Grotesque: titles, names, numerals. Instrument Sans: UI.
        // IBM Plex Mono: times, counts, pills, eyebrows.
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body: ['"Instrument Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        head: ['"Bricolage Grotesque"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Bricolage Grotesque"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Older aliases, kept so nothing breaks.
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        ui: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        monoBrand: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      spacing: {
        'section': '2rem',
        'card-gap': '1.5rem',
        'content': '1rem',
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--accent-primary-soft))",
          dark: "hsl(var(--accent-primary-dark))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // shadcn's hover surface. The CSS variable is --accent-hover because
        // --accent is now the design token for the accent colour itself.
        accent: {
          DEFAULT: "hsl(var(--accent-hover))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          bright: "hsl(var(--gold-bright))",
        },
        // The design tokens, straight from the hex variables.
        rr: {
          bg: "var(--bg)",
          surf: "var(--surf)",
          surf2: "var(--surf2)",
          surf3: "var(--surf3)",
          line: "var(--line)",
          line2: "var(--line2)",
          ink: "var(--ink)",
          ink2: "var(--ink2)",
          dim: "var(--dim)",
          dim2: "var(--dim2)",
          accent: "var(--accent)",
          "accent-ink": "var(--accent-ink)",
          sel: "var(--sel)",
          ok: "var(--ok)",
          "ok-bg": "var(--ok-bg)",
          warn: "var(--warn)",
          "warn-bg": "var(--warn-bg)",
          bad: "var(--bad)",
          "bad-bg": "var(--bad-bg)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
          pink: "var(--brand-pink)",
          lilac: "var(--brand-lilac)",
          blue: "var(--brand-blue)",
          dept: "var(--dept)",
        },
        // The current department's accent (set per shell by DashboardLayout).
        // Used by the switcher dot and a few badges only.
        dept: {
          DEFAULT: "hsl(var(--dept-hsl))",
          ink: "hsl(var(--dept-ink-hsl))",
        },
        crimson: "hsl(var(--crimson))",
        "amber-glow": "hsl(var(--amber-glow))",
        // Tailwind's default `violet` and `purple` scales are overridden with
        // the Vexon grey scale so the ~100 files using
        // `text-violet-500` / `bg-purple-500/15` follow the identity.
        violet: { 50: '#f7f7f8', 100: '#efeff1', 200: '#e0e0e4', 300: '#c9c9cf', 400: '#9e9e9e', 500: '#7a7a80', 600: '#5a5a5a', 700: '#454549', 800: '#323235', 900: '#222224', 950: '#151517' },
        purple: { 50: '#f7f7f8', 100: '#efeff1', 200: '#e0e0e4', 300: '#c9c9cf', 400: '#9e9e9e', 500: '#7a7a80', 600: '#5a5a5a', 700: '#454549', 800: '#323235', 900: '#222224', 950: '#151517' },
        // Still consumed by the RAG board files (boardPrimitives, PaceCurveEditor,
        // TeamMetricsTable, TeamSummaryStrip, AEDetail).
        brand: { 50: '#f1f3f6', 100: '#e8ecf1', 200: '#d1d9e3', 300: '#b3c0cf', 400: '#8a9bb0', 500: '#6b7a90', 600: '#3d5a80', 700: '#2f4661' },
        surface: { card: 'var(--surf2)', cardBot: 'var(--surf2)', well: 'var(--surf2)', wellBot: 'var(--surf2)', track: 'var(--surf3)' },
        txt: { primary: 'var(--ink)', secondary: 'var(--ink2)', muted: 'var(--dim)', label: 'var(--dim)', micro: 'var(--dim2)', faint: 'var(--dim2)', faintest: 'var(--line2)' },
        rag: { crit: 'var(--bad)', critBg: 'var(--bad-bg)', watch: 'var(--warn)', watchBg: 'var(--warn-bg)', steady: 'var(--dim)', steadyBg: 'var(--surf2)' },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        well: '8px',
        pill: '4px',
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        },
        "glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" }
        },
        "shimmer": {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" }
        },
        "scale-up": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.02)" }
        },
        "count-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "progress-fill": {
          "0%": { width: "0" }
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" }
        },
        "dot-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.25)" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "glow": "glow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite linear",
        "scale-up": "scale-up 0.15s ease-out",
        "count-up": "count-up 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        "progress-fill": "progress-fill 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "dot-pulse": "dot-pulse 2s ease-in-out infinite"
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-brand": "var(--gradient-brand)",
        "gradient-brand-deep": "var(--gradient-brand-deep)",
        "gradient-brand-pastel": "var(--gradient-brand-pastel)",
        "gradient-brand-soft": "var(--gradient-brand-soft)",
        "gradient-dept": "var(--gradient-dept)",
        "gradient-dept-rail": "var(--gradient-dept-rail)",
        "gradient-button": "var(--gradient-button)",
        "grad": "var(--grad)",
      },
      // Shadows are retired (elevation is a hairline or a tone step). The
      // names stay so existing `shadow-card` etc. resolve to `none`.
      boxShadow: {
        "card": "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "surface": "var(--shadow-surface)",
        "surface-hover": "var(--shadow-surface-hover)",
        "soft": "var(--shadow-soft)",
        "medium": "var(--shadow-medium)",
        "elevated": "var(--shadow-elevated)",
        "button": "var(--shadow-button)",
        wellInset: 'none',
        trackInset: 'none',
      },
      transitionProperty: {
        "smooth": "var(--transition-smooth)"
      },
      transitionDuration: {
        120: '120ms',
      },
      transitionTimingFunction: {
        ui: 'cubic-bezier(.4,0,.2,1)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

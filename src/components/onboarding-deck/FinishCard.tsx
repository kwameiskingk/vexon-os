// The last card of any deck: gradient, "You are all set", a CTA and the list
// of everything that has been done (past tense, Marcus 4 Sep).
//
// 7 Sep: the CTA is white on the gradient. 11 Sep (Marcus, 8 Sep: "that
// button is too dark"): it is a plain <button>, not the shared Button, so the
// default variant's dark gradient can never win over the white again.

import type { ReactNode } from "react";
import { Check, Loader2, Rocket, Sparkles } from "lucide-react";
import { lightPillBtn } from "./DeckCard";

export function FinishCard({ eyebrow, title, body, ctaLabel, busy, disabled, onGo, items, footnote }: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  busy: boolean;
  disabled?: boolean;
  onGo?: () => void;
  /** Past-tense labels of the completed cards, listed on the right. */
  items: string[];
  /** Small line under the CTA (e.g. "Unlocking your dashboard"). */
  footnote?: ReactNode;
}) {
  return (
    <div className="rounded-[28px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(126,63,181,.55)] bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600 text-white">
      <div className="p-7 sm:p-10 lg:p-12 grid gap-8 lg:grid-cols-[1.2fr_1fr] items-center min-h-[520px]">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/75 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-heading font-bold tracking-tight leading-tight">{title}</h2>
          <p className="mt-3 text-white/85 text-[15px] leading-relaxed max-w-lg">{body}</p>
          <button
            type="button"
            disabled={!onGo || busy || disabled}
            onClick={onGo}
            className={`mt-7 ${lightPillBtn}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Rocket className="h-4 w-4 mr-2" />}
            {ctaLabel}
          </button>
          {footnote && <div className="mt-3 text-sm text-white/80">{footnote}</div>}
        </div>
        <ul className="space-y-2 rounded-2xl bg-white/10 border border-white/20 p-5 backdrop-blur">
          {items.map((label, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center"><Check className="h-3 w-3" /></span>
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

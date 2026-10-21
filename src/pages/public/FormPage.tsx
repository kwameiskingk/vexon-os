// Enquire - the public renderer at /f/<slug>. One question per screen,
// Enter / arrows / A-B-C keys, progress bar, recall (@ref), endings that show
// a message, redirect, or open the lite booking widget prefilled. Works
// full-page and as an iframe (?embed=1): posts vexon-form-height,
// vexon-form-complete {outcome, score_pct} and relays
// vexon-booking-complete from the nested widget. Ported from the website
// qualifier (vexon-site/src/_qualify.html + main.js, 17 Sep).
//
// 19 Sep (the owner, after testing): light by default - the brand wash (pink →
// lilac → blue) on white behind a soft glass card, no grid, a faint glow that
// leans toward the pointer, the full Meridian logo centred, a bigger card, and
// a proper "thank you" with confetti. "Aurora dark" stays as an option, "plain"
// is for embeds. Media (image / video) on questions, welcome and endings.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import logoWhite from "@/assets/vexon-logo-white.svg";
import { submitForm, uploadFormFile, usePublicForm } from "@/hooks/useForms";
import { mediaEmbed } from "@/lib/forms/media";
import {
  hasChoices, isAnswered, nextStep, recall,
  type Answers, type Ending, type FormSchema, type Media, type Question,
} from "@/lib/forms/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inIframe = () => { try { return window.self !== window.top; } catch { return true; } };
const newToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Screen = { kind: "welcome" } | { kind: "question"; q: Question } | { kind: "ending"; ending: Ending; prefill: Record<string, string> | null };
/** light = Aurora (default) · aurora = Aurora dark · plain = flat (embeds) */
type Look = "light" | "aurora" | "plain";

export default function FormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const draft = params.get("draft") === "1";
  const embed = params.get("embed") === "1" || inIframe();
  const isTest = draft || params.get("test") === "1";
  const { data: form, isLoading, error } = usePublicForm(slug, draft);
  const schema = form?.schema;

  const [token] = useState(newToken);
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Browser tab: "Enquire by Vexon OS" while a form is open (the owner, 19 Sep).
  useEffect(() => {
    const prev = document.title;
    document.title = form?.name ? `${form.name} · Enquire by Vexon OS` : "Enquire by Vexon OS";
    return () => { document.title = prev; };
  }, [form?.name]);

  const hidden = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of schema?.hidden ?? []) { const v = params.get(k); if (v) out[k] = v; }
    return out;
  }, [schema, params]);

  // Start: welcome screen if there is one, else the first question.
  useEffect(() => {
    if (!schema || screen) return;
    setScreen(schema.welcome?.title ? { kind: "welcome" } : firstScreen(schema, {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // Embed height contract (same shape as the booking widget).
  useEffect(() => {
    if (!embed) return;
    let last = -1;
    const post = () => {
      const h = Math.ceil(rootRef.current?.getBoundingClientRect().height ?? document.documentElement.scrollHeight);
      if (h === last || h === 0) return; last = h;
      try { window.parent.postMessage({ type: "vexon-form-height", height: h }, "*"); } catch { /* no parent */ }
    };
    post();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(post) : null;
    if (rootRef.current && ro) ro.observe(rootRef.current);
    window.addEventListener("resize", post);
    return () => { ro?.disconnect(); window.removeEventListener("resize", post); };
  }, [embed, screen]);

  // Relay the nested booking widget's completion to our host.
  useEffect(() => {
    if (!embed) return;
    const h = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "vexon-booking-complete" || d.type === "vexon-booking-height") {
        try { window.parent.postMessage(d, "*"); } catch { /* ignore */ }
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [embed]);

  const questions = useMemo(() => schema?.questions ?? [], [schema]);
  const qIndex = screen?.kind === "question" ? questions.findIndex((q) => q.id === screen.q.id) : -1;
  const progress = !schema ? 0 : screen?.kind === "ending" ? 100 : screen?.kind === "welcome" ? 0 : Math.round(((qIndex + 1) / (questions.length + 1)) * 100);

  const validate = useCallback((q: Question, v: unknown): string | null => {
    if (q.type === "statement") return null;
    if (!isAnswered(q, v)) return q.required ? (hasChoices(q.type) ? "Please pick an answer" : q.type === "file" ? "Please add a file" : "Please fill this in") : null;
    if (q.type === "full_name" || q.type === "address") return null;
    const s = Array.isArray(v) ? "" : String(v);
    if (q.type === "email" && !EMAIL_RE.test(s)) return "Hmm, that email address doesn’t look right";
    if (q.type === "phone" && s.replace(/\D/g, "").length < 8) return "Please add a phone number we can reach you on";
    if (q.type === "website" && !/^(https?:\/\/)?[^\s]+\.[^\s]+$/.test(s)) return "That doesn’t look like a link";
    if (q.type === "number" && Number.isNaN(Number(s))) return "Numbers only";
    return null;
  }, []);

  const finish = useCallback(async (finalAnswers: Answers) => {
    if (!schema || !form) return;
    setBusy(true); setErr(null);
    try {
      const res = await submitForm({ slug: form.slug, token, answers: finalAnswers, hidden, test: isTest, referrer: document.referrer || null });
      const ending = res.ending ?? schema.endings.find((e) => e.id === schema.default_ending)!;
      if (embed) { try { window.parent.postMessage({ type: "vexon-form-complete", outcome: ending.outcome ?? null, score_pct: res.score_pct, form: form.slug }, "*"); } catch { /* ignore */ } }
      const url = redirectUrlFor(ending, schema, finalAnswers, hidden);
      if (url) { goTop(url); return; }
      setScreen({ kind: "ending", ending, prefill: res.prefill });
    } catch (e) {
      const errs = (e as { errors?: Record<string, string> }).errors;
      if (errs) {
        const firstBad = schema.questions.find((q) => errs[q.id]);
        if (firstBad) { setScreen({ kind: "question", q: firstBad }); setErr(validate(firstBad, finalAnswers[firstBad.id]) ?? "Please check this answer"); setBusy(false); return; }
      }
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }, [schema, form, token, hidden, isTest, embed, validate]);

  // `override` carries the answers as they are RIGHT NOW. A click on a choice
  // used to schedule next() from a render that didn't yet have that answer, so
  // the first click said "Please pick an answer" (the owner's test, 19 Sep).
  const next = useCallback(async (override?: Answers) => {
    if (!schema || !screen || busy) return;
    let cur = override ?? answers;
    // Ranking: pressing OK without touching the list accepts the order shown.
    if (screen.kind === "question" && screen.q.type === "ranking" && !Array.isArray(cur[screen.q.id])) {
      cur = { ...cur, [screen.q.id]: (screen.q.choices ?? []).map((c) => c.label) }; setAnswers(cur);
    }
    if (screen.kind === "welcome") { setScreen(firstScreen(schema, cur)); return; }
    if (screen.kind !== "question") return;
    const q = screen.q;
    const problem = validate(q, cur[q.id]);
    if (problem) { setErr(problem); return; }
    setErr(null);
    // Partial save once we know who they are (Typeform "partial responses").
    if (q.type === "email" && !isTest) submitForm({ slug: form!.slug, token, answers: cur, hidden, partial: true }).catch(() => {});
    const step = nextStep(schema, cur, q.id);
    setHistory((h) => [...h, q.id]);
    if (step.kind === "question") { setScreen({ kind: "question", q: step.question }); return; }
    // The walk is decided here as well as on the server, so a redirect ending
    // is known before the request goes out. Send the answer with keepalive so
    // it still lands, and navigate now rather than after the round trip.
    const url = redirectUrlFor(step.ending, schema, cur, hidden);
    if (url) {
      setBusy(true);
      if (embed) { try { window.parent.postMessage({ type: "vexon-form-complete", outcome: step.ending.outcome ?? null, score_pct: null, form: form!.slug }, "*"); } catch { /* ignore */ } }
      submitForm(
        { slug: form!.slug, token, answers: cur, hidden, test: isTest, referrer: document.referrer || null },
        { keepalive: true },
      ).catch(() => { /* the answer is best-effort once we are on our way out */ });
      goTop(url);
      return;
    }
    await finish(cur);
  }, [schema, screen, busy, answers, validate, isTest, form, token, hidden, embed, finish]);

  const back = useCallback(() => {
    if (!schema || !history.length) return;
    const prevId = history[history.length - 1];
    const q = questions.find((x) => x.id === prevId);
    setHistory((h) => h.slice(0, -1)); setErr(null);
    if (q) setScreen({ kind: "question", q });
    else if (schema.welcome?.title) setScreen({ kind: "welcome" });
  }, [schema, history, questions]);

  const setAnswer = (id: string, v: unknown): Answers => { const a = { ...answers, [id]: v }; setAnswers(a); setErr(null); return a; };
  const pickAndGo = (id: string, v: unknown) => {
    const a = setAnswer(id, v);
    // The 220ms beat exists so you see which choice you picked. When the next
    // thing is a whole new page, that beat reads as the form hanging.
    let instant = false;
    if (schema && screen?.kind === "question") {
      const step = nextStep(schema, a, screen.q.id);
      instant = step.kind === "ending" && !!redirectUrlFor(step.ending, schema, a, hidden);
    }
    setTimeout(() => void next(a), instant ? 0 : 220);
  };

  // A phone or tablet (no mouse to hover with) reads "Tap", a computer "Click".
  const touch = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(hover: none) and (pointer: coarse)").matches, []);

  // Keyboard: Enter advances, letters pick a choice.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!screen) return;
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement && !e.metaKey)) { e.preventDefault(); void next(); return; }
      if (screen.kind === "question" && (screen.q.type === "choice" || screen.q.type === "yes_no") && /^[a-jA-J]$/.test(e.key) && !(e.target instanceof HTMLInputElement)) {
        const idx = e.key.toUpperCase().charCodeAt(0) - 65; const c = screen.q.choices?.[idx];
        if (c) pickAndGo(screen.q.id, c.label);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, next]);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, [screen]);

  const accent = form?.theme?.accent || "#5a5a5a";
  const look: Look = embed ? "plain" : (form?.theme?.appearance ?? "light");

  if (isLoading) return <Shell embed={embed} accent={accent} look={look}><div className="rf-tile"><div className="flex items-center gap-2 text-sm rf-dim"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></div></Shell>;
  if (error || !form || !schema) return <Shell embed={embed} accent={accent} look={look}><div className="rf-tile"><h1 className="rf-h font-heading text-2xl font-semibold">This form isn’t available.</h1><p className="mt-2 text-sm rf-dim">Check the link, or ask whoever sent it to you.</p></div></Shell>;

  const isChoice = screen?.kind === "question" && (screen.q.type === "choice" || screen.q.type === "yes_no" || screen.q.type === "rating" || screen.q.type === "opinion_scale");
  const answered = questions.filter((q) => q.type !== "statement").length;

  return (
    <Shell embed={embed} accent={accent} look={look} rootRef={rootRef} progress={progress} showLogo={form.theme?.logo !== false && form.theme?.branding !== false} showFooter={form.theme?.branding !== false}
      counter={screen?.kind === "question" ? `${qIndex + 1} / ${questions.length}` : screen?.kind === "welcome" ? `${answered} questions` : undefined}>
      {screen?.kind === "welcome" && (
        <div className="rf-tile rf-in rf-welcome">
          <MediaView media={schema.welcome!.media} />
          <p className="rf-eyebrow">{form.kind === "hiring" ? "Application" : form.kind === "lead" ? "Let's see if we're a fit" : form.name}</p>
          <h1 className="rf-h font-heading text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[2.8rem]">{schema.welcome!.title}</h1>
          {schema.welcome!.body && <p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] leading-relaxed rf-dim">{schema.welcome!.body}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void next()} className="rf-ok">{schema.welcome!.button || "Start"} <span>→</span></button>
            <span className="rf-hint">press <b>Enter ↵</b>{schema.welcome!.time_hint ? <> · {schema.welcome!.time_hint}</> : null}</span>
          </div>
        </div>
      )}

      {screen?.kind === "question" && (
        <div className={cn("rf-tile rf-in", screen.q.media?.position === "side" && "rf-split")} key={screen.q.id}>
          {screen.q.media && screen.q.media.position === "side" && <div className="rf-side"><MediaView media={screen.q.media} /></div>}
          <div className="min-w-0 flex-1">
            {screen.q.media && screen.q.media.position !== "side" && <MediaView media={screen.q.media} />}
            <p className="rf-num"><i>{qIndex + 1}</i><span>→</span></p>
            <h1 className="rf-h font-heading text-[1.75rem] font-semibold leading-[1.2] tracking-tight sm:text-[2.15rem]">{recall(screen.q.title, schema, answers)}</h1>
            {screen.q.help && <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed rf-dim">{recall(screen.q.help, schema, answers)}</p>}
            <div className="mt-7">
              <Field q={screen.q} formKind={form.kind} value={answers[screen.q.id]} onChange={(v) => setAnswer(screen.q.id, v)} onPick={(v) => pickAndGo(screen.q.id, v)} inputRef={inputRef} formId={form.id} />
            </div>
            {err && <p className="rf-err">{err}</p>}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!isChoice && (
                <button type="button" onClick={() => void next()} disabled={busy} className="rf-ok">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>OK <span>✓</span></>}
                </button>
              )}
              {/* 15 Oct 2026 (the owner): no keyboard shortcuts on show. The hint said "or press A / B" on
                  phones with no keyboard, whatever the number of answers, and "⌘ Enter" on Windows.
                  Choice questions now say tap or click; typed answers keep just the OK button.
                  The keys still work for anyone who uses them. */}
              {isChoice && <span className="rf-hint">{touch ? "Tap" : "Click"} an answer to continue</span>}
              <div className="ml-auto flex gap-1.5">
                <button type="button" className="rf-arrow" onClick={back} disabled={!history.length} aria-label="Previous question">↑</button>
                <button type="button" className="rf-arrow" onClick={() => void next()} disabled={busy || (screen.q.required && !isAnswered(screen.q, answers[screen.q.id]))} title={screen.q.required && !isAnswered(screen.q, answers[screen.q.id]) ? "Answer this one to continue" : undefined} aria-label="Next question">↓</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen?.kind === "ending" && (
        <EndingView ending={screen.ending} schema={schema} answers={answers} prefill={screen.prefill} />
      )}
    </Shell>
  );
}

/** 22 Sep 2026 (the owner): a redirect ending has nothing to show, so it must not
 * be shown. Answering "No" used to hold the highlighted choice, wait for the
 * round trip, flash "we received your application" inside the embed and only
 * then move — four beats where there should be one. This builds the URL so the
 * walk can leave the moment the answer is given. */
function redirectUrlFor(
  ending: Ending,
  schema: FormSchema,
  answers: Answers,
  hidden: Record<string, string>,
): string | null {
  if (ending.kind !== "redirect" || !ending.url) return null;
  try {
    const u = new URL(ending.url, window.location.href);
    if (ending.append_answers) {
      for (const q of schema.questions) {
        const v = answers[q.id];
        if (typeof v === "string" && v) u.searchParams.set(q.ref, v);
      }
    }
    for (const [k, v] of Object.entries(hidden)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return null;
  }
}

function goTop(url: string) {
  try { (window.top ?? window).location.href = url; } catch { window.location.href = url; }
}

function firstScreen(schema: FormSchema, answers: Answers): Screen {
  const step = nextStep(schema, answers, null);
  return step.kind === "question" ? { kind: "question", q: step.question } : { kind: "ending", ending: step.ending, prefill: null };
}

/* ── the page: wash, glow, progress, tile ────────────────────────────────── */

function Shell({ children, embed, accent, look, rootRef, progress = 0, showLogo = true, showFooter = true, counter }: {
  children: React.ReactNode; embed: boolean; accent: string; look: Look; rootRef?: React.RefObject<HTMLDivElement>; progress?: number; showLogo?: boolean; showFooter?: boolean; counter?: string;
}) {
  const glowRef = useRef<HTMLDivElement>(null);

  // The wash leans toward the pointer (website hero, 17 Sep), kept faint.
  // rAF-throttled, off for reduced-motion and for touch-only devices.
  useEffect(() => {
    if (embed || look === "plain" || reducedMotion()) return;
    if (window.matchMedia?.("(hover: none)").matches) return;
    let pending = false;
    const move = (e: PointerEvent) => {
      if (pending) return; pending = true;
      requestAnimationFrame(() => {
        glowRef.current?.style.setProperty("--mx", `${e.clientX}px`);
        glowRef.current?.style.setProperty("--my", `${e.clientY}px`);
        pending = false;
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [embed, look]);

  return (
    <div ref={rootRef} className={cn("rf-root", `rf-${look}`, embed ? "rf-embed" : "min-h-screen")} style={{ ["--rf-accent" as string]: accent }}>
      <style>{CSS}</style>
      {!embed && look !== "plain" && (
        <div className="rf-wash" aria-hidden>
          <i className="rf-orb rf-o1" /><i className="rf-orb rf-o2" /><i className="rf-orb rf-o3" />
          <i className="rf-dot rf-d1" /><i className="rf-dot rf-d2" /><i className="rf-dot rf-d3" /><i className="rf-dot rf-d4" />
          <div ref={glowRef} className="rf-glow" />
          <div className="rf-sheen" />
        </div>
      )}
      <div className="rf-bar"><i style={{ width: `${progress}%` }} /></div>
      <div className={cn("relative mx-auto flex w-full max-w-[980px] flex-col px-4 sm:px-6", embed ? "py-6" : "min-h-screen py-9 sm:py-12")}>
        {!embed && (
          <header className="relative mb-7 flex items-center justify-center sm:mb-9">
            {showLogo && <img src={look === "aurora" ? logoWhite : logoGradient} alt="Vexon OS" className="h-5 w-auto sm:h-6" />}
            {counter && <span className="rf-counter absolute right-0 top-1/2 -translate-y-1/2">{counter}</span>}
          </header>
        )}
        <div className={cn(!embed && "flex flex-1 flex-col justify-center")}>{children}</div>
        {!embed && showFooter && <footer className="mt-8 text-center text-[11px] rf-dim2">Powered by Enquire · Meridian</footer>}
      </div>
    </div>
  );
}

function MediaView({ media }: { media?: Media | null }) {
  const e = mediaEmbed(media?.url);
  if (!e) return null;
  if (e.kind === "iframe") return <div className="rf-media rf-media-video"><iframe src={e.src} title={media?.alt || "Video"} allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowFullScreen /></div>;
  if (e.kind === "video") return <div className="rf-media rf-media-video"><video src={e.src} controls playsInline preload="metadata" /></div>;
  return <div className="rf-media"><img src={e.src} alt={media?.alt || ""} loading="lazy" /></div>;
}

function Field({ q, formKind, value, onChange, onPick, inputRef, formId }: { q: Question; formKind: string; value: unknown; onChange: (v: unknown) => void; onPick: (v: unknown) => void; inputRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>; formId: string }) {
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const s = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? (value as string[]) : [];

  if (q.type === "statement") return null;
  if (q.type === "long_text") return <textarea ref={(el) => { inputRef.current = el; }} className="rf-input min-h-[110px] resize-y" placeholder={q.placeholder || "Type your answer here…"} value={s} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === "yes_no" || q.type === "choice" || q.type === "multi_choice") {
    const multi = q.type === "multi_choice";
    const n = q.choices?.length ?? 0;
    return (
      <div className={cn("grid gap-2.5", n <= 2 ? "sm:grid-cols-2" : n >= 6 ? "sm:grid-cols-2" : "")}>
        {(q.choices ?? []).map((c, i) => {
          const on = multi ? list.includes(c.label) : s === c.label;
          return (
            <button key={c.id} type="button" className={cn("rf-choice", on && "on")} onClick={() => {
              if (multi) onChange(on ? list.filter((x) => x !== c.label) : [...list, c.label]);
              else onPick(c.label);
            }}>
              <i>{String.fromCharCode(65 + i)}</i><span>{c.label}</span>
            </button>
          );
        })}
        {multi && <p className="rf-hint sm:col-span-2">Pick as many as apply, then OK.</p>}
      </div>
    );
  }
  if (q.type === "rating") {
    const max = Math.min(10, Math.max(3, Number(q.scale) || 5)); const cur = Number(s) || 0;
    return (
      <div>
        <div className="rf-scale">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={cn("rf-star", n <= cur && "on")} aria-label={`${n} of ${max}`} onClick={() => onPick(String(n))}>★</button>
          ))}
        </div>
        {(q.scale_labels?.low || q.scale_labels?.high) && <div className="rf-scale-labels"><span>{q.scale_labels?.low}</span><span>{q.scale_labels?.high}</span></div>}
      </div>
    );
  }
  if (q.type === "opinion_scale") {
    const max = Math.min(10, Math.max(2, Number(q.scale) || 10)); const cur = s === "" ? -1 : Number(s);
    return (
      <div>
        <div className="rf-scale rf-scale-num">
          {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
            <button key={n} type="button" className={cn("rf-choice rf-num-btn", n === cur && "on")} onClick={() => onPick(String(n))}>{n}</button>
          ))}
        </div>
        <div className="rf-scale-labels"><span>{q.scale_labels?.low ?? "Not at all"}</span><span>{q.scale_labels?.high ?? "Absolutely"}</span></div>
      </div>
    );
  }
  if (q.type === "ranking") {
    const all = (q.choices ?? []).map((c) => c.label);
    const order = list.length ? list.filter((x) => all.includes(x)).concat(all.filter((x) => !list.includes(x))) : all;
    const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= order.length) return; const o = [...order]; [o[i], o[j]] = [o[j], o[i]]; onChange(o); };
    return (
      <div className="grid gap-2.5">
        {order.map((label, i) => (
          <div key={label} className="rf-choice rf-rank">
            <i>{i + 1}</i><span className="flex-1">{label}</span>
            <button type="button" className="rf-arrow" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="rf-arrow" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>
        ))}
        <p className="rf-hint">Put these in order, most important first, then OK.{!list.length && " (Press OK to accept this order.)"}</p>
      </div>
    );
  }
  if (q.type === "legal") {
    const on = s === "Yes";
    return (
      <button type="button" className={cn("rf-choice", on && "on")} onClick={() => onChange(on ? "" : "Yes")}>
        <i>{on ? "✓" : ""}</i><span>{q.placeholder || "I accept"}</span>
      </button>
    );
  }
  if (q.type === "full_name") {
    const o = (value && typeof value === "object" ? value : {}) as { first?: string; last?: string };
    return (
      <div className="grid gap-3 sm:max-w-[680px] sm:grid-cols-2">
        <input ref={(el) => { inputRef.current = el; }} className="rf-input" placeholder="First name" autoComplete="given-name" value={o.first ?? ""} onChange={(e) => onChange({ ...o, first: e.target.value })} />
        <input className="rf-input" placeholder="Last name" autoComplete="family-name" value={o.last ?? ""} onChange={(e) => onChange({ ...o, last: e.target.value })} />
      </div>
    );
  }
  if (q.type === "address") {
    const o = (value && typeof value === "object" ? value : {}) as Record<string, string>;
    const set = (k: string, v: string) => onChange({ ...o, [k]: v });
    return (
      <div className="grid gap-3 sm:max-w-[680px] sm:grid-cols-2">
        <input ref={(el) => { inputRef.current = el; }} className="rf-input sm:col-span-2" placeholder="Street address" autoComplete="address-line1" value={o.line1 ?? ""} onChange={(e) => set("line1", e.target.value)} />
        <input className="rf-input sm:col-span-2" placeholder="Street address line 2" autoComplete="address-line2" value={o.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
        <input className="rf-input" placeholder="City" autoComplete="address-level2" value={o.city ?? ""} onChange={(e) => set("city", e.target.value)} />
        <input className="rf-input" placeholder="State / Province" autoComplete="address-level1" value={o.state ?? ""} onChange={(e) => set("state", e.target.value)} />
        <input className="rf-input" placeholder="Postal / Zip code" autoComplete="postal-code" value={o.postcode ?? ""} onChange={(e) => set("postcode", e.target.value)} />
        <input className="rf-input" placeholder="Country" autoComplete="country-name" value={o.country ?? ""} onChange={(e) => set("country", e.target.value)} />
      </div>
    );
  }
  if (q.type === "dropdown") return (
    <select className="rf-input" value={s} onChange={(e) => onChange(e.target.value)} ref={(el) => { inputRef.current = el as unknown as HTMLInputElement; }}>
      <option value="">Choose…</option>
      {(q.choices ?? []).map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
    </select>
  );
  if (q.type === "file") {
    const f = value as { path?: string; name?: string } | undefined;
    return (
      <div>
        <label className="rf-choice cursor-pointer" style={{ maxWidth: 420 }}>
          <input type="file" className="hidden" accept={q.accept || undefined} onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            if (file.size > 10 * 1024 * 1024) { setUpErr("That file is over 10 MB."); return; }
            setUploading(true); setUpErr(null);
            try { onChange(await uploadFormFile(formId, file)); } catch (err) { setUpErr(err instanceof Error ? err.message : "Upload failed"); }
            finally { setUploading(false); }
          }} />
          <i>{uploading ? "…" : "↑"}</i>
          <span className="truncate">{uploading ? "Uploading…" : f?.name || "Choose a file"}</span>
        </label>
        {upErr && <p className="rf-err">{upErr}</p>}
      </div>
    );
  }
  const type = q.type === "email" ? "email" : q.type === "phone" ? "tel" : q.type === "number" ? "number" : q.type === "date" ? "date" : q.type === "website" ? "url" : "text";
  const auto = q.ref === "name" ? "name" : q.ref === "email" ? "email" : q.ref === "phone" ? "tel" : q.ref === "company" ? "organization" : q.ref === "first_name" ? "given-name" : q.ref === "last_name" ? "family-name" : undefined;
  // Hiring forms ask for a personal address; lead forms for a work one.
  const emailPh = formKind === "hiring" ? "you@email.com" : "name@company.com";
  return <input ref={(el) => { inputRef.current = el; }} type={type} inputMode={q.type === "phone" ? "tel" : undefined} autoComplete={auto} className="rf-input" placeholder={q.placeholder || (q.type === "email" ? emailPh : "Type your answer here…")} value={s} onChange={(e) => onChange(e.target.value)} />;
}

function EndingView({ ending, schema, answers, prefill }: { ending: Ending; schema: FormSchema; answers: Answers; prefill: Record<string, string> | null }) {
  const title = recall(ending.title, schema, answers);
  const body = ending.body ? recall(ending.body, schema, answers) : "";
  const celebrate = ending.kind === "message" && ending.outcome !== "unqualified";

  // Confetti on the thank-you screen (the owner, 19 Sep). Lazy-loaded, skipped for reduced motion.
  useEffect(() => {
    if (!celebrate || reducedMotion()) return;
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#dedede", "#9e9e9e", "#6b7a90", "#ffffff"];
      confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin: { y: 0.62 }, colors, scalar: 0.95, ticks: 220, disableForReducedMotion: true });
      setTimeout(() => { if (!cancelled) { confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors, ticks: 200 }); confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors, ticks: 200 }); } }, 260);
    }).catch(() => { /* no confetti, no problem */ });
    return () => { cancelled = true; };
  }, [celebrate]);

  if (ending.kind === "booking" && ending.event_slug) {
    const u = new URL(`/bookings/${ending.event_slug}`, window.location.origin);
    u.searchParams.set("embed", "1"); u.searchParams.set("lite", "1");
    for (const [k, v] of Object.entries(prefill ?? {})) if (v) u.searchParams.set(k, v);
    return (
      <div className="rf-tile rf-in">
        <MediaView media={ending.media} />
        <h1 className="rf-h font-heading text-[1.8rem] font-bold leading-tight tracking-tight sm:text-[2.3rem]">{title}</h1>
        {body && <p className="mt-2 text-[15px] rf-dim">{body}</p>}
        <BookingFrame src={u.toString()} />
      </div>
    );
  }
  return (
    <div className="rf-tile rf-in rf-end">
      <span className="rf-check" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7.5" /></svg></span>
      <h1 className="rf-h font-heading text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[2.9rem]">{title}</h1>
      {body && <p className="mt-4 max-w-2xl whitespace-pre-line text-[17px] leading-relaxed rf-dim">{body}</p>}
      <MediaView media={ending.media} />
      {ending.kind === "redirect" && <p className="mt-4 text-sm rf-dim">Taking you there…</p>}
    </div>
  );
}

function BookingFrame({ src }: { src: string }) {
  const [h, setH] = useState(640);
  useEffect(() => {
    const l = (e: MessageEvent) => { const d = e.data; if (d && d.type === "vexon-booking-height" && d.height) setH(Math.max(520, Math.ceil(d.height) + 8)); };
    window.addEventListener("message", l); return () => window.removeEventListener("message", l);
  }, []);
  return <iframe src={src} title="Book a call" className="rf-bookframe mt-6 w-full" style={{ height: h }} allow="clipboard-write" />;
}

/* ── styles. Three looks share one tile; the look sets the palette. ─────── */
const CSS = `
/* 15 Oct 2026 (UI pass): the form speaks the Vexon OS design system. Light =
   paper with ink; aurora = the dark theme; plain = embeds. No orbs, no
   glass, no glows: hairlines, the brand gradient on the progress line, the
   question number in lilac, the hovered/selected choice border and OK. */
.rf-root{font-family:'Instrument Sans',system-ui,-apple-system,sans-serif;position:relative;isolation:isolate;
  --rf-pink:#dedede;--rf-lilac:#9e9e9e;--rf-blue:#6b7a90;
  --rf-grad:linear-gradient(135deg,var(--rf-pink) 0%,var(--rf-lilac) 50%,var(--rf-blue) 100%);
  --rf-bg:#ffffff;--rf-fg:#111113;--rf-dim:#30343f;--rf-dim2:#66666e;--rf-ink-on-grad:#0f0f11;
  --rf-tile:transparent;--rf-tile-border:transparent;--rf-tile-hi:transparent;
  --rf-line:#d2d2d7;--rf-chip:#f5f5f6;--rf-chip-border:#e3e3e6;
  --rf-choice:#ffffff;--rf-choice-hover:#ffffff;--rf-err:#b42323;--rf-accent:#3d5a80;
  color:var(--rf-fg);background:var(--rf-bg)}
.rf-root.rf-aurora{--rf-bg:#0f0f11;--rf-fg:#eceef4;--rf-dim:#c6cad6;--rf-dim2:#7f8496;--rf-ink-on-grad:#0f0f11;
  --rf-line:#282c38;--rf-chip:#111319;--rf-chip-border:#1a1d27;
  --rf-choice:#0f0f11;--rf-choice-hover:#111319;--rf-err:#f07070;--rf-accent:#9fb3c8}
.rf-root.rf-plain{--rf-bg:transparent;--rf-fg:hsl(var(--foreground));--rf-dim:hsl(var(--muted-foreground));--rf-dim2:hsl(var(--muted-foreground));
  --rf-line:hsl(var(--border));--rf-chip:hsl(var(--card));--rf-chip-border:hsl(var(--border));--rf-choice:hsl(var(--card));--rf-choice-hover:hsl(var(--muted));--rf-err:hsl(var(--destructive))}
.rf-root.rf-plain:not(.rf-embed){background:hsl(var(--background))}
.rf-embed{background:transparent}
.rf-root .rf-h{color:var(--rf-fg);font-family:'Bricolage Grotesque','Instrument Sans',system-ui,sans-serif;font-weight:500;letter-spacing:-.02em}
.rf-dim{color:var(--rf-dim)}.rf-dim2{color:var(--rf-dim2)}

/* wash: retired. The ground is flat. */
.rf-wash{position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--rf-bg)}
.rf-orb,.rf-dot,.rf-sheen,.rf-glow{display:none}

/* progress */
.rf-bar{position:fixed;left:0;right:0;top:0;height:2px;background:var(--rf-chip-border);z-index:5}
.rf-embed .rf-bar{position:relative}
.rf-bar i{position:absolute;inset:0 auto 0 0;background:var(--rf-grad);transition:width .45s cubic-bezier(.2,.7,.2,1)}
.rf-counter{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--rf-dim2);
  border:1px solid var(--rf-chip-border);background:var(--rf-chip);border-radius:4px;padding:4px 8px}

/* tile: a section on the page, not a box */
.rf-tile{position:relative;border-radius:0;padding:24px 0;background:transparent;border:0;box-shadow:none}
.rf-plain .rf-tile{padding:0}
@media(min-width:640px){.rf-tile{padding:32px 0}.rf-plain .rf-tile{padding:0}}
.rf-tile:before{display:none}
.rf-split{display:flex;gap:28px;align-items:flex-start}
.rf-side{width:40%;flex:none}
@media(max-width:720px){.rf-split{display:block}.rf-side{width:100%;margin-bottom:18px}}
.rf-in{animation:none}

/* type + chips */
.rf-eyebrow{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;color:var(--rf-lilac);font-weight:500}
.rf-num{display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;font-weight:600;color:var(--rf-dim)}
.rf-num i{font-style:normal;display:inline-flex;align-items:center;font-family:'IBM Plex Mono',ui-monospace,monospace;color:var(--rf-lilac);font-size:13px;font-weight:600;padding:0;background:none;box-shadow:none}
.rf-hint{font-size:12.5px;color:var(--rf-dim2)}.rf-hint b{color:var(--rf-dim);font-weight:600}
.rf-err{margin-top:12px;font-size:13.5px;font-weight:500;color:var(--rf-err)}

/* controls */
.rf-ok{display:inline-flex;align-items:center;gap:8px;background:var(--rf-grad);color:var(--rf-ink-on-grad);font-weight:700;font-size:14px;padding:10px 18px;border-radius:6px;border:0;cursor:pointer;
  box-shadow:none;transition:filter .12s}
.rf-ok:hover{filter:brightness(1.05)}
.rf-ok:disabled{opacity:.5;cursor:default}
.rf-arrow{width:32px;height:32px;border-radius:6px;border:1px solid var(--rf-line);background:transparent;color:var(--rf-fg);cursor:pointer;font-size:14px;transition:border-color .12s}
.rf-arrow:hover{border-color:var(--rf-accent)}.rf-arrow:disabled{opacity:.3;cursor:default}
.rf-input{width:100%;max-width:680px;font-size:20px;padding:10px 0;border:0;border-bottom:1px solid var(--rf-line);background:transparent;outline:none;color:var(--rf-fg);
  transition:border-color .2s;border-radius:0;font-family:inherit}
.rf-input::placeholder{color:var(--rf-dim2)}
.rf-input:focus{border-image:var(--rf-grad) 1;border-bottom-width:2px}
.rf-root select.rf-input{color:var(--rf-fg)}.rf-root select.rf-input option{color:#111113}
.rf-aurora .rf-input[type=date]{color-scheme:dark}
.rf-choice{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 14px;border:1px solid var(--rf-line);border-radius:8px;
  background:var(--rf-choice);color:var(--rf-fg);cursor:pointer;font-size:15px;font-family:inherit;transition:background .12s,border-color .12s;position:relative}
.rf-choice:hover,.rf-choice.on{border-color:transparent;background:linear-gradient(var(--rf-choice-hover),var(--rf-choice-hover)) padding-box,var(--rf-grad) border-box;box-shadow:none;transform:none}
.rf-choice i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;border-radius:4px;
  border:1px solid var(--rf-chip-border);background:var(--rf-chip);font-size:11px;font-weight:600;color:var(--rf-dim);font-family:'IBM Plex Mono',ui-monospace,monospace}
.rf-choice.on i{background:var(--rf-grad);color:var(--rf-ink-on-grad);border-color:transparent}
.rf-choice span{min-width:0}

/* rating / opinion scale / ranking */
.rf-scale{display:flex;flex-wrap:wrap;gap:8px}
.rf-star{font-size:32px;line-height:1;background:none;border:0;cursor:pointer;color:var(--rf-chip-border);transition:color .12s;padding:2px}
.rf-star.on{color:#e0b64f;text-shadow:none}
.rf-scale-num .rf-num-btn{width:48px;justify-content:center;padding:10px 0;font-weight:600}
.rf-scale-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--rf-dim2)}
.rf-rank{cursor:default}.rf-rank:hover{transform:none}
/* media */
.rf-media{margin:0 0 20px;border-radius:8px;overflow:hidden;border:1px solid var(--rf-chip-border);background:var(--rf-chip)}
.rf-media img{display:block;width:100%;max-height:380px;object-fit:cover}
.rf-media-video{aspect-ratio:16/9}.rf-media-video iframe,.rf-media-video video{display:block;width:100%;height:100%;border:0}
.rf-end .rf-media{margin:22px 0 0}
.rf-bookframe{border-radius:8px;border:1px solid var(--rf-chip-border);background:#fff}

/* ending */
.rf-end{text-align:center;padding-top:44px;padding-bottom:48px}
.rf-end p{margin-left:auto;margin-right:auto}
.rf-check{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:12px;margin-bottom:22px;color:var(--rf-ink-on-grad);background:var(--rf-grad);box-shadow:none}
.rf-check svg{width:32px;height:32px}
`;

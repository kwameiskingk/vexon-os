// 2 Oct 2026 (Marcus's client onboarding review): the form keeps every
// question, and instead a FLAG tells the CSM when a client picks something we
// no longer sell (Embedded, Executive Search) or describes themselves as
// talent-led rather than industry-led. Answers may be keyed by question ref
// (the client journey) or by question id (Enquire responses); both are read.

const SERVICE_FLAGS = ["embedded", "executive search", "exec search"];

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" && v ? [v] : [];

export function onboardingAnswerFlags(answers: Record<string, unknown> | null | undefined): string[] {
  if (!answers) return [];
  const flags: string[] = [];
  const services = asList(answers.service_types).map((s) => s.toLowerCase());
  const offSell = services.filter((s) => SERVICE_FLAGS.some((f) => s.includes(f)));
  if (offSell.length) flags.push(`Services we no longer run: ${offSell.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ")}`);
  const led = asList(answers.industry_or_talent_led).map((s) => s.toLowerCase());
  if (led.some((s) => s.startsWith("talent led"))) flags.push("Describes themselves as talent-led (we only take industry-led clients)");
  return flags;
}

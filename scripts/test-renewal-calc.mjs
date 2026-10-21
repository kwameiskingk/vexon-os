// Unit tests for src/lib/renewal/renewalCalc.ts against the signed-off
// artefact's worked example (handover §8) and its edge cases (§6.5).
// Run:  node scripts/test-renewal-calc.mjs   (bundles via esbuild, no framework)
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(mkdtempSync(join(tmpdir(), "renewal-calc-")), "renewalCalc.mjs");
await build({ entryPoints: ["src/lib/renewal/renewalCalc.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const calc = await import(pathToFileURL(out).href);
const { computeRenewal, money, roiText, netText, showRateText, count, coerce } = calc;

let passed = 0, failed = 0;
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}\n      expected ${e}\n      actual   ${a}`); }
};

const DEFAULTS = { booked: 18, sat: 15, vacancies: 9, fee: 8000, investment: 7500, monthly: 2500 };

console.log("Worked example — artefact defaults, Expected (factor 1):");
const r = computeRenewal(DEFAULTS, 1);
eq("A booked/sat/vac", [r.a.booked, r.a.sat, r.a.vacancies], [18, 15, 9]);
eq("B booked/sat/vac", [r.b.booked, r.b.sat, r.b.vacancies], [72, 60, 36]);
eq("C booked/sat/vac", [r.c.booked, r.c.sat, r.c.vacancies], [72, 60, 144]);
eq("fees A/B/C", [money(r.a.fees), money(r.b.fees), money(r.c.fees)], ["£72,000", "£288,000", "£1,152,000"]);
eq("investment A/B/C", [money(r.a.investment), money(r.b.investment), money(r.c.investment)], ["£7,500", "£30,000", "£30,000"]);
eq("ROI A/B/C", [roiText(r.a.fees, r.a.investment), roiText(r.b.fees, r.b.investment), roiText(r.c.fees, r.c.investment)], ["9.6×", "9.6×", "38.4×"]);
eq("show-up 83% in all three columns", [showRateText(r.a.booked, r.a.sat), showRateText(r.b.booked, r.b.sat), showRateText(r.c.booked, r.c.sat)], ["83%", "83%", "83%"]);
eq("net A", netText(r.a.fees, r.a.investment), "£64,500 ahead · +860%");

console.log("Projection toggle — applies to B and C only, never A:");
const low = computeRenewal(DEFAULTS, 0.8);
const high = computeRenewal(DEFAULTS, 1.2);
eq("A identical across Low/Expected/High", [low.a, high.a], [r.a, r.a]);
eq("Low B vac ×3.2", low.b.vacancies, 9 * 4 * 0.8);
eq("High B vac ×4.8", high.b.vacancies, 9 * 4 * 1.2);
eq("Low C vac", low.c.vacancies, 9 * 4 * 0.8 * 4);
eq("investment unaffected by factor (monthly×12)", [low.b.investment, high.b.investment], [30000, 30000]);
eq("show-up unchanged by factor", [showRateText(low.b.booked, low.b.sat), showRateText(high.b.booked, high.b.sat)], ["83%", "83%"]);

console.log("Edge cases — must not regress (handover §6.5):");
eq("zero investment → em-dash ROI, not Infinity", roiText(72000, 0), "—");
eq("zero booked → em-dash show-up, not NaN", showRateText(0, 0), "—");
eq("negative net → '£X behind' with minus pct", netText(6000, 7500), "£1,500 behind · −20%");
eq("en-GB thousands separators", money(1152000), "£1,152,000");
eq("coerce: negative → 0", coerce(-5), 0);
eq("coerce: garbage → 0", coerce("abc"), 0);
eq("computeRenewal with zeros: ROI null, no NaN", (() => { const z = computeRenewal({ booked: 0, sat: 0, vacancies: 0, fee: 0, investment: 0, monthly: 0 }, 1); return [z.a.roi, z.a.showUpRate, Number.isNaN(z.a.net)]; })(), [null, null, false]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

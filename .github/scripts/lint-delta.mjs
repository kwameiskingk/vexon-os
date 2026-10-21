// Lint gate for a PR (quality plan, 6 Oct 2026): the files the PR touches may
// add no new ESLint problem classes versus the base branch, and files the PR
// creates must be lint-clean. `main` itself is not lint-clean (prettier and
// older rules), so a whole-repo `eslint .` would always fail; this compares
// per file, per rule, head against base. `@typescript-eslint/no-explicit-any`
// is one of those rules, so "no new any" is enforced here by count, which a
// re-touched line that already had one cannot raise.
//
// Usage: node .github/scripts/lint-delta.mjs <base-ref>
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const base = process.argv[2];
if (!base) { console.error("usage: lint-delta.mjs <base-ref>"); process.exit(2); }

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const lintable = (f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/integrations/supabase/types.ts");

const status = sh(`git diff --name-status ${base}...HEAD`).split("\n").filter(Boolean);
const added = [], modified = [];
for (const line of status) {
  const [code, ...rest] = line.split("\t");
  const file = rest[rest.length - 1];
  if (!lintable(file)) continue;
  if (code.startsWith("A")) added.push(file);
  else if (code.startsWith("M") || code.startsWith("R")) modified.push(file);
}
if (added.length === 0 && modified.length === 0) { console.log("No lintable files changed."); process.exit(0); }

/** { file: { ruleId: count } } for the given files, run from `cwd`. */
function lint(files, cwd) {
  if (files.length === 0) return {};
  // eslint reports real paths; a temp dir on macOS sits behind a symlink.
  cwd = realpathSync(cwd);
  const r = spawnSync("node_modules/.bin/eslint", ["--format", "json", "--no-error-on-unmatched-pattern", ...files], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!r.stdout) { console.error(r.stderr); throw new Error("eslint produced no output"); }
  const out = {};
  for (const res of JSON.parse(r.stdout)) {
    const rel = res.filePath.startsWith(cwd) ? res.filePath.slice(cwd.length + 1) : res.filePath;
    const counts = {};
    for (const m of res.messages) counts[m.ruleId || "parse"] = (counts[m.ruleId || "parse"] || 0) + 1;
    out[rel] = counts;
  }
  return out;
}

const headCwd = realpathSync(process.cwd());
const headCounts = lint([...added, ...modified], headCwd);

let failed = false;
for (const f of added) {
  const c = headCounts[f] || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (total > 0) { failed = true; console.log(`NEW FILE NOT CLEAN  ${f}: ${JSON.stringify(c)}`); }
  else console.log(`clean               ${f}`);
}

if (modified.length > 0) {
  // Base versions of the modified files, laid out at the same relative paths
  // beside a symlinked node_modules and the head's config files, so eslint
  // resolves the same plugins and rules.
  const tmp = mkdtempSync(join(tmpdir(), "lint-base-"));
  try {
    for (const cfg of ["eslint.config.js", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"]) {
      try { writeFileSync(join(tmp, cfg), sh(`git show HEAD:${cfg}`)); } catch { /* optional */ }
    }
    execSync(`ln -s "${join(headCwd, "node_modules")}" "${join(tmp, "node_modules")}"`);
    const present = [];
    for (const f of modified) {
      try {
        const content = execSync(`git show ${base}:${f}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        mkdirSync(join(tmp, dirname(f)), { recursive: true });
        writeFileSync(join(tmp, f), content);
        present.push(f);
      } catch { /* renamed from elsewhere: treated as added below */ }
    }
    const baseCounts = lint(present, tmp);
    for (const f of modified) {
      const h = headCounts[f] || {}, b = baseCounts[f] || {};
      const worse = Object.entries(h).filter(([rule, n]) => n > (b[rule] || 0));
      if (worse.length > 0) {
        failed = true;
        console.log(`NEW PROBLEMS        ${f}: ${worse.map(([r, n]) => `${r} ${b[r] || 0}→${n}`).join(", ")}`);
      } else console.log(`no new problems     ${f}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);

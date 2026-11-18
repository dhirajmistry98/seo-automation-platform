#!/usr/bin/env node
/**
 * CI dependency audit: runs `npm audit` over every dependency and fails on any advisory of moderate or higher
 * severity, except advisories listed in .github/audit-allowlist.json with a reason and an expiry date.
 * An expired entry fails again, so every exception is re-checked instead of being forgotten.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEVERITY = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/** Advisories (with their GHSA id) found in an `npm audit --json` report. */
export function auditAdvisories(report) {
  const found = new Map();
  for (const vulnerability of Object.values(report?.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      if (!via || typeof via !== "object") continue;
      const id = String(via.url || "").match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i)?.[0] || `npm-${via.source}`;
      found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url });
    }
  }
  return [...found.values()];
}

/** Splits advisories at or above `level` into blocking, allowed and expired-allowance lists. */
export function auditGate(report, allowlist, today = new Date(), level = "moderate") {
  const blocking = []; const allowed = []; const expired = [];
  for (const advisory of auditAdvisories(report)) {
    if ((SEVERITY[advisory.severity] ?? 4) < SEVERITY[level]) continue;
    const entry = allowlist.find((item) => item.id === advisory.id);
    if (!entry) blocking.push(advisory);
    else if (!(new Date(`${entry.expires}T23:59:59Z`) >= today)) expired.push({ ...advisory, expires: entry.expires });
    else allowed.push({ ...advisory, reason: entry.reason, expires: entry.expires });
  }
  return { blocking, allowed, expired, ok: blocking.length === 0 && expired.length === 0 };
}

function main() {
  const allowlist = JSON.parse(readFileSync(new URL("../.github/audit-allowlist.json", import.meta.url), "utf8"));
  let output;
  // npm audit exits non-zero whenever it finds anything; the JSON report is what matters.
  try { output = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); }
  catch (error) { output = error.stdout; }
  const report = JSON.parse(output || "{}");
  if (report.error) { console.error("npm audit failed:", report.error.summary || report.error); process.exit(1); }
  const result = auditGate(report, allowlist);
  for (const item of result.allowed) console.log(`ALLOWED until ${item.expires}: ${item.id} ${item.package} (${item.severity}) - ${item.reason}`);
  for (const item of result.expired) console.error(`EXPIRED allowance (${item.expires}): ${item.id} ${item.package} (${item.severity}) ${item.url} - re-check for a fix, then renew or remove it.`);
  for (const item of result.blocking) console.error(`VULNERABLE: ${item.id} ${item.package} (${item.severity}) ${item.title} ${item.url}`);
  console.log(result.ok ? "Dependency audit passed." : "Dependency audit failed.");
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

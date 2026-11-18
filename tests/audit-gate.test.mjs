import test from "node:test";
import assert from "node:assert/strict";
import { auditAdvisories, auditGate } from "../scripts/audit-gate.mjs";

const advisory = (name, id, severity) => ({ source: 1, name, title: `${name} issue`, url: `https://github.com/advisories/${id}`, severity, range: "*" });
const report = {
  vulnerabilities: {
    picomatch: { severity: "high", via: [advisory("picomatch", "GHSA-fc5q-39xc-vjpf", "high")] },
    micromatch: { severity: "high", via: ["picomatch"] },
    lodash: { severity: "low", via: [advisory("lodash", "GHSA-aaaa-bbbb-cccc", "low")] },
  },
};
const allowlist = [{ id: "GHSA-fc5q-39xc-vjpf", reason: "dev only", expires: "2027-01-31" }];

test("advisories are collected once each, ignoring transitive package names", () => {
  assert.deepEqual(auditAdvisories(report).map((item) => item.id), ["GHSA-fc5q-39xc-vjpf", "GHSA-aaaa-bbbb-cccc"]);
});

test("an allowlisted advisory passes until its expiry date, then fails again", () => {
  assert.equal(auditGate(report, allowlist, new Date("2026-11-18")).ok, true);
  assert.equal(auditGate(report, allowlist, new Date("2027-01-31T12:00:00Z")).ok, true);
  const expired = auditGate(report, allowlist, new Date("2027-02-01"));
  assert.equal(expired.ok, false);
  assert.equal(expired.expired[0].id, "GHSA-fc5q-39xc-vjpf");
});

test("any other moderate or higher advisory still fails CI; low ones do not", () => {
  const withNew = { vulnerabilities: { ...report.vulnerabilities, next: { severity: "moderate", via: [advisory("next", "GHSA-dddd-eeee-ffff", "moderate")] } } };
  const result = auditGate(withNew, allowlist, new Date("2026-11-18"));
  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking.map((item) => item.id), ["GHSA-dddd-eeee-ffff"]);
  assert.equal(auditGate(report, [], new Date("2026-11-18")).blocking.length, 1, "without the allowlist the picomatch advisory blocks");
});

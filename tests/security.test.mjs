import test from "node:test";
import { ObjectId } from "mongodb";
import assert from "node:assert/strict";
import { isSameOriginRequest, isAllowedBodySize, readJsonLimited, readTextLimited, requestClientIp } from "../src/lib/security/request.ts";
import { auditHtml, addCrossPageIssues, getHealthScoreDetails, getPageHealthScore } from "../src/lib/seo/audit.ts";
import { createOAuthPkce, decryptGoogleSecret, encryptGoogleSecret, isGoogleService, hashOAuthState } from "../src/lib/integrations/google.ts";
import { hasOrganizationPermission } from "../src/lib/organizations.ts";
import { assertPublicUrl, createPinnedLookup } from "../src/lib/seo/url-security.ts";
import { buildDomainRankRows, getProviderItems, isDataForSeoConfigured, normalizeSearchDevice, readDataForSeoResponse } from "../src/lib/integrations/dataforseo.ts";
import { ensureSessionUserProfile, persistUserProfile } from "../src/lib/user-profile.ts";
import { revokeUserSessions } from "../src/lib/security/sessions.ts";
import { formatAuthUser } from "../src/lib/auth-user-format.ts";
import { isVerifiedGoogleSignIn } from "../src/lib/google-signin.ts";
import { calculateAuthorityIndex } from "../src/lib/seo/authority-index.ts";
import { analyzeSearchVisibility } from "../src/lib/seo/search-visibility.ts";
import { robotsHomepagePolicy } from "../src/lib/seo/search-access.ts";
import { buildOrganizationInvitationEmail, escapeEmailHtml } from "../src/lib/email.ts";
import { normalizeResearchDomain } from "../src/lib/integrations/dataforseo.ts";
import { getRankTrackingKeywords, nextRankTrackingAt, parseRankTrackingDevice, parseRankTrackingFrequency, parseRankTrackingLanguageCode, parseRankTrackingLocationCode } from "../src/lib/seo/rank-schedule.ts";
import { getWebsiteSeoTarget } from "../src/lib/seo/target.ts";
import { assertProductionEnvironment } from "../src/lib/production-env.ts";

test("organization invitation email escapes workspace-controlled content", () => {
  assert.equal(escapeEmailHtml("<script> & \"x\"</script>"), "&lt;script&gt; &amp; &quot;x&quot;&lt;/script&gt;");
  const email = buildOrganizationInvitationEmail("<img src=x onerror=alert(1)>", "seo_specialist", "https://app.example.test/accept?token=a&next=b");
  assert.ok(email.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(email.html.includes("seo specialist"));
  assert.ok(email.html.includes("token=a&amp;next=b"));
  assert.ok(!email.html.includes("<img src=x"));
});

test("Google sign-in only accepts an explicitly verified matching email", () => {
  assert.equal(isVerifiedGoogleSignIn({ email: "User@Example.com", email_verified: true }, "user@example.com"), true);
  assert.equal(isVerifiedGoogleSignIn({ email: "user@example.com", email_verified: false }, "user@example.com"), false);
  assert.equal(isVerifiedGoogleSignIn({ email: "other@example.com", email_verified: true }, "user@example.com"), false);
  assert.equal(isVerifiedGoogleSignIn({ email_verified: true }, "user@example.com"), false);
});

test("competitor domains normalize to public hostnames and reject unsafe or non-domain inputs", () => {
  assert.equal(normalizeResearchDomain(" HTTPS://WWW.Example.com/ "), "example.com");
  assert.equal(normalizeResearchDomain("competitor.example.com"), "competitor.example.com");
  assert.equal(normalizeResearchDomain("example.com/path"), null);
  assert.equal(normalizeResearchDomain("localhost"), null);
  assert.equal(normalizeResearchDomain("127.0.0.1"), null);
  assert.equal(normalizeResearchDomain("https://user@example.com"), null);
  assert.equal(normalizeResearchDomain("https://example.com:8443"), null);
});

test("same-origin guard requires an origin matching the application", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test/base";
  assert.equal(isSameOriginRequest(new Request("https://app.example.test/api/write", { headers: { origin: "https://app.example.test" } })), true);
  assert.equal(isSameOriginRequest(new Request("https://app.example.test/api/write", { headers: { origin: "https://evil.test" } })), false);
  assert.equal(isSameOriginRequest(new Request("https://app.example.test/api/write", { headers: { origin: "https://app.example.test", "sec-fetch-site": "cross-site" } })), false);
  assert.equal(isSameOriginRequest(new Request("https://app.example.test/api/write")), false);
});

test("rate-limit client IP only trusts the explicitly configured ingress header", () => {
  process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
  assert.equal(requestClientIp(new Request("https://app.test", { headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.5" } })), "203.0.113.8");
  process.env.TRUSTED_CLIENT_IP_HEADER = "x-forwarded-for";
  assert.equal(requestClientIp(new Request("https://app.test", { headers: { "x-forwarded-for": "198.51.100.5, 203.0.113.8" } })), "unknown");
});

test("production startup configuration requires HTTPS, TLS MongoDB, and a trusted proxy IP header", () => {
  const values = {
    NODE_ENV: "production",
    AUTH_SECRET: "a".repeat(48),
    NEXT_PUBLIC_APP_URL: "https://app.example.test",
    AUTH_GOOGLE_ID: "client-id",
    AUTH_GOOGLE_SECRET: "client-secret",
    GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
    TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    MONGODB_URI: "mongodb://user:pass@one.example.test:27017,two.example.test:27017/seo?ssl=true&replicaSet=rs0&authSource=admin",
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    assert.doesNotThrow(assertProductionEnvironment);
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    assert.throws(assertProductionEnvironment, /TRUSTED_CLIENT_IP_HEADER/);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("request body limits reject oversized and malformed lengths, and cap streamed bodies", async () => {
  assert.equal(isAllowedBodySize(new Request("https://app.test", { headers: { "content-length": "10" } }), 8), false);
  assert.equal(isAllowedBodySize(new Request("https://app.test", { headers: { "content-length": "nope" } }), 8), false);
  const parsed = await readJsonLimited(new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) }), 100);
  assert.deepEqual(parsed, { ok: true, value: { ok: true } });
  const oversized = await readJsonLimited(new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: "123456789" }), 4);
  assert.deepEqual(oversized, { ok: false, status: 413 });
  const wrongContentType = await readJsonLimited(new Request("https://app.test", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }), 100);
  assert.deepEqual(wrongContentType, { ok: false, status: 400 });
  await assert.rejects(readTextLimited(new Response("12345"), 4), /size limit/);
});

test("role permissions follow least privilege", () => {
  assert.equal(hasOrganizationPermission("owner", "members.manage"), true);
  assert.equal(hasOrganizationPermission("analyst", "reports.read"), true);
  assert.equal(hasOrganizationPermission("analyst", "websites.manage"), false);
  assert.equal(hasOrganizationPermission("viewer", "tasks.manage"), false);
  assert.equal(hasOrganizationPermission("viewer", "research.run"), false);
  assert.equal(hasOrganizationPermission("seo_specialist", "research.run"), true);
  assert.equal(hasOrganizationPermission("unknown", "websites.read"), false);
});

test("SEO research only returns a site's own matching positions and handles missing results", () => {
  const rows = buildDomainRankRows([
    { result: [{ items: [{ domain: "www.example.test", url: "https://www.example.test/page", rank_group: 4, title: "Relevant" }, { domain: "competitor.test", url: "https://competitor.test", rank_group: 1 }] }] },
    { result: [{ items: [{ domain: "example.test.evil.test", url: "https://example.test.evil.test", rank_group: 2 }] }] },
  ], ["first query", "second query"], "example.test");
  assert.equal(rows[0].keyword, "first query");
  assert.equal(rows[0].rank_group, 4);
  assert.equal(rows[1].rank_group, null);
});

test("SEO research provider item extraction is empty-safe and credentials remain optional", () => {
  assert.deepEqual(getProviderItems({ tasks: [{ result: [{ items: [{ keyword: "seo" }] }] }] }), [{ keyword: "seo" }]);
  assert.deepEqual(getProviderItems({}), []);
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  assert.equal(isDataForSeoConfigured(), false);
  assert.equal(normalizeSearchDevice("mobile"), "mobile");
  assert.equal(normalizeSearchDevice("tablet"), "desktop");
});

test("crawler rejects private IPs and non-HTTP URL schemes", async () => {
  for (const url of ["http://127.0.0.1/", "http://10.0.0.8/", "http://169.254.169.254/latest/meta-data/", "http://198.51.100.10/", "http://[3fff::1]/", "file:///etc/passwd"]) {
    await assert.rejects(assertPublicUrl(url));
  }
});

test("crawler DNS lookup uses only the prevalidated public address", () => {
  const pinned = createPinnedLookup("example.test", [{ address: "8.8.8.8", family: 4 }]);
  pinned("example.test", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
  pinned("attacker.test", {}, (error) => assert.equal(error?.code, "EACCES"));
});

test("SEO audit detects missing metadata and duplicate page titles", () => {
  const headers = new Headers();
  const pageA = auditHtml("https://site.test/a", "https://site.test/a", 200, "<html><head><title>Same</title></head><body><h1>A</h1><h2>Section</h2><a href='/b'>B</a></body></html>", headers);
  const pageB = auditHtml("https://site.test/b", "https://site.test/b", 200, "<html><head><title>Same</title></head><body><h1>B</h1></body></html>", headers);
  assert.ok(pageA.issues.some((issue) => issue.ruleId === "metadata.description_missing"));
  addCrossPageIssues([pageA, pageB]);
  assert.ok(pageA.issues.some((issue) => issue.ruleId === "metadata.title_duplicate"));
  const score = getHealthScoreDetails([pageA, pageB]);
  assert.ok(score && score.score >= 0 && score.score <= 100);
});

test("SEO audit flags missing social metadata, page language, empty headings, and hierarchy skips", () => {
  const page = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>A sufficiently descriptive page title</title><meta name='description' content='A sufficiently useful page description that gives readers enough context to understand this page.'><link rel='canonical' href='https://site.test/'></head><body><h1>Topic</h1><h3>Skipped</h3><h2></h2></body></html>", new Headers());
  const rules = new Set(page.issues.map((item) => item.ruleId));
  assert.ok(rules.has("metadata.og_title_missing"));
  assert.ok(rules.has("metadata.og_description_missing"));
  assert.ok(rules.has("metadata.og_image_missing"));
  assert.ok(rules.has("metadata.twitter_card_missing"));
  assert.ok(rules.has("metadata.language_missing"));
  assert.ok(rules.has("headings.empty"));
  assert.ok(rules.has("headings.level_skipped"));
});

test("SEO audit detects common CMS markers and reports HTTPS configuration", () => {
  const wordpress = auditHtml("http://site.test/", "http://site.test/", 200,
    "<html><head><meta name='generator' content='WordPress 6.7'><title>Site home page with a useful title</title></head><body><h1>Home</h1><h2>Section</h2></body></html>", new Headers());
  assert.deepEqual(wordpress.cmsDetection, { name: "WordPress", confidence: "high", evidence: "Generator: WordPress 6.7" });
  assert.ok(wordpress.issues.some((item) => item.ruleId === "technical.https_missing"));
});

test("configured primary keywords are reported when absent from title and H1", () => {
  const page = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>Site home page with a useful title</title></head><body><h1>Welcome</h1><p>Local search services.</p></body></html>", new Headers(), { primaryKeywords: ["SEO audit", "local search", "SEO audit"] });
  const keywordFinding = page.issues.find((item) => item.ruleId === "content.primary_keyword_missing");
  assert.ok(keywordFinding);
  assert.equal(keywordFinding.evidence, "SEO audit, local search");
  const included = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>SEO audit services for local businesses</title></head><body><h1>SEO audit services</h1></body></html>", new Headers(), { primaryKeywords: ["SEO audit"] });
  assert.ok(!included.issues.some((item) => item.ruleId === "content.primary_keyword_missing"));
});

test("cross-page audit flags pages with no incoming links in the crawl scope", () => {
  const root = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>Site home page with a useful title</title></head><body><h1>Home</h1><h2>Section</h2><a href='/about'>About</a></body></html>", new Headers());
  const linked = auditHtml("https://site.test/about", "https://site.test/about", 200,
    "<html><head><title>About the business and its services</title></head><body><h1>About</h1><h2>Our story</h2></body></html>", new Headers());
  const orphan = auditHtml("https://site.test/orphan", "https://site.test/orphan", 200,
    "<html><head><title>Unlinked page and useful details</title></head><body><h1>Unlinked</h1><h2>Details</h2></body></html>", new Headers());
  addCrossPageIssues([root, linked, orphan]);
  assert.ok(!linked.issues.some((item) => item.ruleId === "internal.not_linked_from_crawl"));
  assert.ok(orphan.issues.some((item) => item.ruleId === "internal.not_linked_from_crawl"));
});

test("hreflang audit checks reciprocal links and tolerates malformed alternate URLs", () => {
  const source = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>Home page with useful information</title><link rel='alternate' hreflang='fr' href='/fr'><link rel='alternate' hreflang='de' href='http://['></head><body><h1>Home</h1></body></html>", new Headers());
  const alternate = auditHtml("https://site.test/fr", "https://site.test/fr", 200,
    "<html><head><title>French page with useful information</title></head><body><h1>Accueil</h1></body></html>", new Headers());
  assert.ok(source.issues.some((item) => item.ruleId === "hreflang.url_invalid"));
  assert.doesNotThrow(() => addCrossPageIssues([source, alternate]));
  assert.ok(source.issues.some((item) => item.ruleId === "hreflang.return_missing"));
});

test("page health scores expose weighted categories based on page-level findings", () => {
  const page = auditHtml("https://site.test/", "https://site.test/", 200,
    "<html><head><title>Site home page with a useful title</title><meta name='description' content='A useful summary for this public website and its visitors.'></head><body><h1>Home</h1><h2>Section</h2></body></html>", new Headers());
  const score = getPageHealthScore(page);
  assert.ok(score.score >= 0 && score.score <= 100);
  assert.ok(score.components.onPage < 100);
  assert.equal(score.components.externalLinkQuality, 100);
});

test("Google secrets are authenticated encrypted and OAuth state is hashed", () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptGoogleSecret("refresh-token-secret");
  assert.notEqual(encrypted, "refresh-token-secret");
  assert.equal(decryptGoogleSecret(encrypted), "refresh-token-secret");
  const [iv, tag, ciphertext] = encrypted.split(".");
  const corruptedTag = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  assert.throws(() => decryptGoogleSecret(`${iv}.${corruptedTag}.${ciphertext}`));
  const { verifier, challenge } = createOAuthPkce();
  assert.ok(verifier.length >= 43 && challenge.length >= 43);
  assert.notEqual(hashOAuthState("state"), "state");
  assert.equal(isGoogleService("search_console"), true);
  assert.equal(isGoogleService("unlisted"), false);
});

test("authenticated profiles persist user identity and safe profile fields in MongoDB", async () => {
  let update;
  const db = { collection: (name) => ({ updateOne: async (...args) => { assert.equal(name, "users"); update = args; return { modifiedCount: 1, upsertedCount: 0 }; } }) };
  const now = new Date("2026-11-08T12:00:00Z");
  const result = await persistUserProfile(db, { id: "507f1f77bcf86cd799439011", email: " Dhiraj@Example.com ", name: "Dhiraj Mistry", image: "https://images.example/avatar.png", provider: "google", now });
  assert.equal(result.userId, "507f1f77bcf86cd799439011");
  assert.equal(update[0]._id.toHexString(), result.userId);
  assert.ok(!Object.hasOwn(update[1].$set, "userId"));
  assert.ok(!Object.hasOwn(update[1].$set, "userId"));
  assert.equal(update[1].$set.email, "dhiraj@example.com");
  assert.equal(update[1].$set.name, "Dhiraj Mistry");
  assert.equal(update[1].$set.image, "https://images.example/avatar.png");
  assert.equal(update[1].$set.lastLoginProvider, "google");
  assert.equal(update[1].$set.lastLoginAt, now);
  assert.equal(update[2].upsert, true);
  assert.ok(!Object.hasOwn(update[1].$set, "password"));
  await assert.rejects(persistUserProfile(db, { id: "google-provider-subject", email: "user@example.com", provider: "google" }), /MongoDB user ID/);
});

test("dashboard session reconciliation stores profile fields without inventing a new login", async () => {
  let update;
  const db = { collection: (name) => ({ updateOne: async (...args) => { assert.equal(name, "users"); update = args; return { modifiedCount: 1, upsertedCount: 0 }; } }) };
  await ensureSessionUserProfile(db, { id: "507f1f77bcf86cd799439011", email: " Dhiraj@Example.com ", name: "Dhiraj Mistry", image: "https://images.example/avatar.png" });
  assert.ok(!Object.hasOwn(update[1].$set, "userId"));
  assert.equal(update[1].$set.email, "dhiraj@example.com");
  assert.equal(update[1].$set.name, "Dhiraj Mistry");
  assert.equal(update[1].$set.image, "https://images.example/avatar.png");
  assert.ok(!Object.hasOwn(update[1].$set, "lastLoginAt"));
  assert.ok(!Object.hasOwn(update[1].$setOnInsert, "lastLoginAt"));
});

test("Auth.js user formatting safely ignores legacy string userId fields", () => {
  const user = formatAuthUser({ _id: new ObjectId("507f1f77bcf86cd799439011"), userId: "legacy-string", email: "person@example.test", name: "Person" });
  assert.equal(user.id, "507f1f77bcf86cd799439011");
  assert.equal(user.email, "person@example.test");
  assert.ok(!Object.hasOwn(user, "userId"));
});

test("Authority Index requires real source data and does not use SEO Health scores", () => {
  const empty = calculateAuthorityIndex({});
  assert.equal(empty.score, null);
  assert.ok(empty.missing.includes("DataForSEO backlink summary"));
  const complete = calculateAuthorityIndex({
    backlinks: { referring_domains: 80, referring_ips: 60, backlinks_spam_score: 18 },
    searchQueries: [{ keys: ["seo audit software"], clicks: 150 }, { keys: ["website audit"], clicks: 40 }],
    pages: [{ finalUrl: "https://example.com/", status: 200, robots: "", healthScore: { score: 0 } }, { finalUrl: "http://example.com/about", status: 200, robots: "", healthScore: { score: 100 } }],
    primaryKeywords: ["seo audit", "website audit"],
  });
  assert.equal(complete.version, "authority-v1");
  assert.ok(complete.score !== null && complete.score >= 0 && complete.score <= 100);
  assert.equal(complete.components.topicalCoverage, 100);
  assert.equal(complete.components.technicalTrust, 50);
  assert.ok(complete.confidence < 100);
});

test("account deletion revokes the current and every active JWT session", async () => {
  const revoked = [];
  const deleted = [];
  const db = { collection: (name) => ({
    find: (query) => ({ toArray: async () => name === "active_sessions" && query.userId === "user-1" ? [{ jti: "session-old" }] : [] }),
    createIndex: async (...args) => { assert.equal(name, "auth_revoked_sessions"); assert.equal(args[0].expiresAt, 1); },
    bulkWrite: async (operations) => revoked.push(...operations),
    deleteMany: async (query) => deleted.push({ name, query }),
  }) };
  const now = new Date("2026-11-09T12:00:00Z");
  const count = await revokeUserSessions(db, "user-1", "session-current", now, 60);
  assert.equal(count, 2);
  assert.deepEqual(revoked.map((item) => item.updateOne.filter.jti).sort(), ["session-current", "session-old"]);
  assert.ok(revoked.every((item) => item.updateOne.update.$set.expiresAt.getTime() === now.getTime() + 60_000));
  assert.deepEqual(deleted, [{ name: "active_sessions", query: { userId: "user-1" } }]);
});

test("DataForSEO responses are size-limited before parsing", async () => {
  assert.deepEqual(await readDataForSeoResponse(new Response('{"status_code":200}')), { status_code: 200 });
  await assert.rejects(readDataForSeoResponse(new Response("x".repeat(16 * 1024 * 1024 + 1))), /size limit/);
});

test("rank tracking settings validate inputs, cap keywords, and schedule from UTC dates", () => {
  assert.equal(parseRankTrackingFrequency("weekly"), "weekly");
  assert.equal(parseRankTrackingFrequency("hourly"), null);
  assert.equal(parseRankTrackingDevice("mobile"), "mobile");
  assert.equal(parseRankTrackingDevice("tablet"), null);
  assert.equal(parseRankTrackingLocationCode("2356"), 2356);
  assert.equal(parseRankTrackingLocationCode("9041134"), 9041134);
  assert.equal(parseRankTrackingLocationCode("999999999999"), 999999999999);
  assert.equal(parseRankTrackingLocationCode("1000000000000"), null);
  assert.equal(parseRankTrackingLocationCode("0"), null);
  assert.equal(parseRankTrackingLanguageCode(" EN "), "en");
  assert.equal(parseRankTrackingLanguageCode("english"), null);
  assert.deepEqual(getRankTrackingKeywords([" SEO ", "SEO", "", "keyword".repeat(30), ...Array.from({ length: 12 }, (_, index) => "term " + index)]), ["SEO", ...Array.from({ length: 9 }, (_, index) => "term " + index)]);
  const monday = new Date("2026-11-09T00:00:00.000Z");
  assert.equal(nextRankTrackingAt("weekly", monday)?.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(nextRankTrackingAt("manual", monday), null);
});

test("website SEO target preserves selected worldwide local location and provider country mapping", () => {
  assert.deepEqual(getWebsiteSeoTarget({
    rankTrackingLocationCode: 1001501,
    rankTrackingLocationName: "Mumbai,Maharashtra,India",
    rankTrackingCountryCode: "IN",
    rankTrackingCountryName: "India",
    rankTrackingCountryLocationCode: 2356,
    rankTrackingLanguageCode: "hi",
  }), {
    locationCode: 1001501,
    locationName: "Mumbai,Maharashtra,India",
    countryCode: "IN",
    countryName: "India",
    countryLocationCode: 2356,
    languageCode: "hi",
  });
  assert.equal(getWebsiteSeoTarget({}).countryCode, "IN");
});

test("search visibility reports transparent GEO, AEO and LLMO signals from crawled pages", () => {
  const page = auditHtml("https://site.test/", "https://site.test/", 200,
    `<html lang="en"><head><title>How our verified service helps local businesses</title><meta name="description" content="A clear summary that explains the service, the people responsible, and the evidence customers can review."><meta name="author" content="Example Editor"><link rel="canonical" href="https://site.test/"><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "Example" }, { "@type": "Article", author: { "@type": "Person", name: "Example Editor" }, datePublished: "2026-10-10" }, { "@type": "FAQPage", mainEntity: [] }] })}</script></head><body><h1>How our verified service helps local businesses?</h1><h2>How does this service work?</h2><p>This explanation provides a concise answer with useful context and verifiable steps for readers who need to understand the service.</p><a href="https://source.test/report">Primary source</a></body></html>`, new Headers());
  const report = analyzeSearchVisibility([page]);
  assert.equal(page.searchSignals?.hasOrganizationIdentity, true);
  assert.equal(page.searchSignals?.hasAuthorAttribution, true);
  assert.equal(page.searchSignals?.hasFaqSchema, true);
  assert.equal(page.searchSignals?.directAnswerBlockCount, 1);
  assert.deepEqual(report.scores, { geo: 100, aeo: 100, llmo: 100 });
  assert.ok(report.limitations.some((item) => item.includes("do not predict inclusion")));
});

test("search visibility reports an empty sample without inventing readiness results", () => {
  const report = analyzeSearchVisibility([]);
  assert.equal(report.pageCount, 0);
  assert.deepEqual(report.scores, { geo: 0, aeo: 0, llmo: 0 });
  assert.equal(report.recommendations.length, 0);
});


test("AI crawler homepage policy follows exact bot groups and wildcard robots rules", () => {
  const robots = "User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /";
  assert.equal(robotsHomepagePolicy(robots, "GPTBot"), "allowed_on_root");
  assert.equal(robotsHomepagePolicy(robots, "ClaudeBot"), "blocked_on_root");
  assert.equal(robotsHomepagePolicy("User-agent: GPTBot\nDisallow: /private", "GPTBot"), "allowed_on_root");
  assert.equal(robotsHomepagePolicy("Sitemap: https://example.test/sitemap.xml", "GPTBot"), "not_specified");
});

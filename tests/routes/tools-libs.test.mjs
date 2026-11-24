import test from "node:test";
import assert from "node:assert/strict";
import { buildHtmlTags, buildSitemapXml, validate, escapeMarkup } from "../../src/lib/seo/hreflang.ts";
import { validateRedirectRule, exportNginx, exportApache, exportCsv, exportVercel, normalizeRedirectPath } from "../../src/lib/seo/redirects.ts";

// ---------- hreflang builder ----------
const rows = [{ lang: "en", region: "US", url: "https://example.com/" }, { lang: "hi", region: "IN", url: "https://example.com/hi?a=1&b=2" }];

test("hreflang: builds correct alternate tags with x-default", () => {
  const html = buildHtmlTags(rows, "https://example.com/");
  assert.match(html, /hreflang="en-US" href="https:\/\/example\.com\/"/);
  assert.match(html, /hreflang="hi-IN"/);
  assert.match(html, /hreflang="x-default"/);
});
test("hreflang: ampersands are escaped so sitemap XML stays valid", () => {
  const xml = buildSitemapXml(rows, "");
  assert.ok(xml.includes("a=1&amp;b=2"));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(xml), "no raw ampersand may remain");
});
test("hreflang: a URL cannot break out of the attribute", () => {
  const html = buildHtmlTags([{ lang: "en", region: "", url: 'https://x.com/"><script>alert(1)</script>' }], "");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&quot;&gt;&lt;script&gt;"));
});
test("hreflang: sitemap has every alternate under every url entry", () => {
  const xml = buildSitemapXml(rows, "https://example.com/");
  assert.equal((xml.match(/<url>/g) || []).length, 2);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, 2);
});
test("hreflang: empty input yields empty output", () => {
  assert.equal(buildHtmlTags([], ""), "");
  assert.equal(buildSitemapXml([{ lang: "", region: "", url: "" }], ""), "");
});
test("hreflang: validation catches missing fields, duplicates and non-http URLs", () => {
  assert.deepEqual(validate(rows), []);
  assert.ok(validate([{ lang: "", region: "", url: "" }]).length >= 2);
  assert.ok(validate([...rows, rows[0]]).some((e) => /Duplicate/.test(e)));
  assert.ok(validate([{ lang: "en", region: "", url: "javascript:alert(1)" }]).some((e) => /http/.test(e)));
  assert.ok(validate([{ lang: "en", region: "", url: "data:text/html,x" }]).length);
  assert.ok(validate([{ lang: "en", region: "", url: "not a url" }]).length);
});
test("hreflang: escapeMarkup handles all five characters", () => {
  assert.equal(escapeMarkup(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

// ---------- redirect manager ----------
test("redirects: valid rules are accepted", () => {
  assert.equal(validateRedirectRule("/old", "/new"), null);
  assert.equal(validateRedirectRule("/old", "https://example.com/new?x=1&y=2"), null);
  assert.equal(normalizeRedirectPath("old"), "/old");
});
test("redirects: missing, identical and malformed rules are rejected", () => {
  assert.ok(validateRedirectRule("", "/new"));
  assert.ok(validateRedirectRule("old", "/new"));
  assert.ok(validateRedirectRule("/old", ""));
  assert.ok(validateRedirectRule("/a", "/a"));
  assert.ok(validateRedirectRule("//evil.com", "/new"));
  assert.ok(validateRedirectRule("/old", "javascript:alert(1)"));
  assert.ok(validateRedirectRule("/old", "ftp://x.com/y"));
  assert.ok(validateRedirectRule("/old", "//evil.com/x"));
});
test("redirects: nginx / Apache directive injection is blocked", () => {
  const attacks = ["/new; return 200 \"pwn\"", "/new\nRedirect 301 /admin http://evil", "/new }\nserver {", "/new\"; include /etc/passwd;", "/new$1", "/a b"];
  for (const a of attacks) {
    assert.ok(validateRedirectRule("/old", a), `destination ${JSON.stringify(a)} must be rejected`);
    assert.ok(validateRedirectRule(a.startsWith("/") ? a : "/" + a, "/new"), `source ${JSON.stringify(a)} must be rejected`);
  }
});
test("redirects: exports produce correct config for valid rules", () => {
  const rules = [{ source: "/old", destination: "/new", type: "301", createdAt: new Date() }, { source: "/tmp", destination: "https://x.com/y", type: "302", createdAt: new Date() }];
  assert.match(exportNginx(rules), /rewrite \^\/old\$ \/new permanent;/);
  assert.match(exportNginx(rules), /rewrite \^\/tmp\$ https:\/\/x\.com\/y redirect;/);
  assert.match(exportApache(rules), /Redirect 301 \/old \/new/);
  assert.deepEqual(JSON.parse(exportVercel(rules)).redirects[0], { source: "/old", destination: "/new", permanent: true });
});
test("redirects: CSV export escapes quotes and neutralises spreadsheet formulas", () => {
  const csv = exportCsv([{ source: "/a", destination: "/b", type: "301", note: '=HYPERLINK("http://evil")', createdAt: new Date() }, { source: "/c", destination: "/d", type: "302", note: 'say "hi", ok', createdAt: new Date() }]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "source,destination,type,note");
  assert.ok(lines[1].includes("\"'=HYPERLINK(\"\"http://evil\"\")\""), lines[1]);
  assert.ok(lines[2].endsWith('"say ""hi"", ok"'));
});

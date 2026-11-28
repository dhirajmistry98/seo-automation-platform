import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NAV_GROUPS, NAV_ITEMS, activeNavHref } from "../../src/lib/dashboard/nav.ts";

const root = "src/app/dashboard";
function staticPages(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory() || name.startsWith("[") || name === "styles") continue;
    if (existsSync(join(full, "page.tsx"))) out.push("/dashboard/" + relative(root, full));
    staticPages(full, out);
  }
  return out;
}
// Pages that are deliberately not in the sidebar: invite links, and the small tools opened from the Tools hub.
const REACHED_ELSEWHERE = new Set(["/dashboard/invitations/accept", "/dashboard/tools/schema", "/dashboard/tools/hreflang", "/dashboard/tools/redirects"]);

test("nav: every link points at a page that exists", () => {
  for (const item of NAV_ITEMS) {
    const file = item.href === "/dashboard" ? join(root, "page.tsx") : join(root, item.href.replace("/dashboard/", ""), "page.tsx");
    assert.ok(existsSync(file), `${item.href} has no page (${file})`);
  }
});
test("nav: every dashboard page is reachable from the sidebar or the Tools hub", () => {
  const inNav = new Set(NAV_ITEMS.map((item) => item.href));
  const orphans = staticPages().filter((path) => !inNav.has(path) && !REACHED_ELSEWHERE.has(path));
  assert.deepEqual(orphans, [], "add these pages to src/lib/dashboard/nav.ts");
});
test("nav: no duplicate links, labels or empty groups", () => {
  const hrefs = NAV_ITEMS.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(new Set(NAV_ITEMS.map((item) => item.label)).size, NAV_ITEMS.length);
  assert.ok(NAV_GROUPS.every((group) => group.entries.length > 0));
  assert.ok(NAV_GROUPS.flatMap((group) => group.entries).filter((entry) => "children" in entry).every((section) => section.children.length > 0 && section.label && section.icon));
});
test("nav: exactly one item is highlighted, and the most specific one wins", () => {
  assert.equal(activeNavHref("/dashboard"), "/dashboard");
  assert.equal(activeNavHref("/dashboard/tools"), "/dashboard/tools");
  assert.equal(activeNavHref("/dashboard/tools/audit"), "/dashboard/tools/audit");
  assert.equal(activeNavHref("/dashboard/tools/schema"), "/dashboard/tools", "small tools highlight the hub");
  assert.equal(activeNavHref("/dashboard/tools/pagespeed"), "/dashboard/tools/pagespeed");
  assert.equal(activeNavHref("/dashboard/report/example.com"), "/dashboard/report");
  assert.equal(activeNavHref("/dashboard/websites/example.com/diagnose"), "/dashboard/websites");
  assert.equal(activeNavHref("/dashboard/research/example.com"), "/dashboard/research");
  assert.equal(activeNavHref("/dashboard/unknown"), null);
});
test("nav: WordPress and Integrations stay available", () => {
  const hrefs = NAV_ITEMS.map((item) => item.href);
  assert.ok(hrefs.includes("/dashboard/wordpress") && hrefs.includes("/dashboard/integrations"));
});

import { readFileSync } from "node:fs";
test("tools hub: every tool card is placed in a category, and every category entry exists", () => {
  const src = readFileSync("src/app/dashboard/tools/page.tsx", "utf8");
  const tools = [...src.matchAll(/\{ name: "([^"]+)", description:/g)].map((m) => m[1]);
  const grouped = [...src.slice(src.indexOf("TOOL_GROUPS"), src.indexOf("export default")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const known = new Set(tools);
  for (const name of tools) assert.ok(grouped.includes(name), `"${name}" is not in any hub category`);
  for (const name of grouped.filter((n) => /^[A-Z]/.test(n) && !/^(Performance|Keywords|Technical|AI search|Where|Find|Crawl|How)/.test(n))) assert.ok(known.has(name), `category lists "${name}", which is not a tool`);
  assert.ok(src.includes("workspace-tool-group"));
});
test("tools hub: every card link points at a page that exists", () => {
  const src = readFileSync("src/app/dashboard/tools/page.tsx", "utf8");
  for (const [, href] of src.matchAll(/href: "(\/dashboard[^"?#]*)/g)) {
    const file = href === "/dashboard" ? join(root, "page.tsx") : join(root, href.replace("/dashboard/", ""), "page.tsx");
    assert.ok(existsSync(file), `${href} has no page`);
  }
});

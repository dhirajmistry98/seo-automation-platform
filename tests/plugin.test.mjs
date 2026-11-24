import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Engine = require("php-parser");
const php = readFileSync("wordpress-plugin/seo-studio/seo-studio.php", "utf8");
const readme = readFileSync("wordpress-plugin/seo-studio/readme.txt", "utf8");
const syncRoute = readFileSync("src/app/api/plugin/v1/sync/route.ts", "utf8");
const downloadRoute = readFileSync("src/app/api/plugin/download/route.ts", "utf8");
const lines = php.split("\n");

test("plugin: PHP parses without syntax errors", () => {
  const ast = new Engine({ parser: { php8: true, extractDoc: false }, ast: { withPositions: true } }).parseCode(php);
  assert.ok(ast.children.length > 0);
});

test("plugin: file starts with an ABSPATH guard so it cannot run outside WordPress", () => {
  assert.match(php, /if \(!defined\('ABSPATH'\)\) \{ exit; \}/);
  assert.ok(php.indexOf("ABSPATH") < php.indexOf("final class"));
});

test("plugin: version is consistent in the header, the constant and the readme", () => {
  const header = php.match(/^ \* Version: (\S+)/m)?.[1];
  const constant = php.match(/const VERSION = '([^']+)'/)?.[1];
  const stable = readme.match(/^Stable tag: (\S+)/m)?.[1];
  assert.ok(header && header === constant && constant === stable, `${header} / ${constant} / ${stable}`);
});

test("plugin: every REST route declares a real permission check (none is open to everyone)", () => {
  const routes = [...php.matchAll(/register_rest_route\('seo-studio\/v1', '([^']+)', \[(.*)\]\);/g)];
  assert.ok(routes.length >= 10, "expected the plugin's routes");
  for (const [, path, body] of routes) {
    assert.match(body, /'permission_callback' =>/, `${path} has no permission_callback`);
    assert.ok(!/__return_true/.test(body), `${path} is public`);
    assert.match(body, /current_user_can\('(manage_options|edit_posts)'\)|app_permission/, `${path} permission is not a capability or token check`);
  }
});

test("plugin: admin-only settings and redirect routes require manage_options", () => {
  for (const path of ["/connection", "/redirects"]) {
    const rows = [...php.matchAll(new RegExp(`register_rest_route\\('seo-studio/v1', '${path}', \\[(.*)\\]\\);`, "g"))];
    assert.ok(rows.length >= 1);
    rows.forEach(([, body]) => assert.match(body, /manage_options/, path));
  }
});

test("plugin: routes that change data from the app need the connection token", () => {
  for (const path of ["/app/metadata", "/sitemap"]) {
    const rows = [...php.matchAll(new RegExp(`register_rest_route\\('seo-studio/v1', '${path}', \\[(.*)\\]\\);`, "g"))];
    assert.ok(rows.length >= 1);
    rows.forEach(([, body]) => assert.match(body, /app_permission/, path));
  }
});

test("plugin: the token is compared in constant time and only a Bearer token of the right shape is accepted", () => {
  const fn = php.slice(php.indexOf("public static function app_permission"), php.indexOf("public static function app_update_metadata"));
  assert.match(fn, /hash_equals\(\$saved, \$token\)/);
  assert.match(fn, /\^Bearer\\s\+\(sseo_\[A-Za-z0-9_-\]\{40,60\}\)\$/);
  assert.match(fn, /\$saved !== ''/, "an unconfigured site must never authenticate");
});

test("plugin: token format matches what the app generates, and the app and plugin regexes agree", () => {
  const pluginRegex = new RegExp(php.match(/preg_match\('\/(\^sseo_\[A-Za-z0-9_-\]\{40,60\}\$)\/', \$token\)/)[1]);
  const serverRegex = new RegExp(syncRoute.match(/\.test\(token\)|\/(\^sseo_[^/]+)\/\.test\(token\)/)?.[1] ?? "^sseo_[A-Za-z0-9_-]{40,60}$");
  for (let i = 0; i < 500; i++) {
    const token = `sseo_${randomBytes(32).toString("base64url")}`; // same recipe as the app's token route
    assert.match(token, pluginRegex);
    assert.match(token, serverRegex);
  }
  assert.doesNotMatch("sseo_short", pluginRegex);
  assert.doesNotMatch("Bearer sseo_" + "a".repeat(43), pluginRegex);
});

test("plugin: the token is stored encrypted (AES-256-GCM) and never printed back", () => {
  assert.match(php, /openssl_encrypt\(\$token, 'aes-256-gcm'/);
  assert.match(php, /random_bytes\(12\)/);
  assert.match(php, /type="password"[^>]*value=""/);
  assert.ok(!/echo[^;]*get_app_token\(\)/.test(php) && !/printf\([^;]*\$token\b/.test(php.replace(/placeholder="[^"]*"/g, "")));
});

test("plugin: every state-changing admin action checks capability and a nonce", () => {
  const sync = php.slice(php.indexOf("public static function sync_now"), php.indexOf("public static function schedule_post_sync"));
  assert.match(sync, /current_user_can\('manage_options'\)/);
  assert.match(sync, /check_admin_referer\('seo_studio_sync'\)/);
  const page = php.slice(php.indexOf("public static function settings_page"), php.indexOf("private static function encrypt_app_token"));
  assert.match(page, /current_user_can\('manage_options'\)/);
  assert.match(page, /wp_verify_nonce\(/);
  const meta = php.slice(php.indexOf("public static function save_meta"), php.indexOf("public static function sanitize_schema"));
  assert.match(meta, /wp_verify_nonce\(/);
  assert.match(meta, /current_user_can\('edit_post', \$post_id\)/);
});

test("plugin: every use of request input is unslashed and sanitised or validated on the same line", () => {
  const offenders = lines.map((l, i) => [l, i + 1]).filter(([l]) => /\$_(POST|GET|REQUEST|COOKIE|SERVER)\b/.test(l))
    .filter(([l]) => !/(sanitize_|esc_url_raw|absint|wp_verify_nonce|isset\(\$_|\?\? ''\)|=== '|== '|check_admin_referer)/.test(l))
    // JSON-LD is the one raw field: sanitising it would break the JSON, so it is validated with json_decode instead (asserted below).
    .filter(([l]) => !/trim\(wp_unslash\(\$_POST\[self::META_SCHEMA\]\)\)/.test(l));
  assert.deepEqual(offenders.map(([l, n]) => `${n}: ${l.trim().slice(0, 80)}`), []);
});

test("plugin: the raw JSON-LD field is only stored after json_decode validation and re-encoded on output", () => {
  const save = php.slice(php.indexOf("public static function save_meta"), php.indexOf("public static function sanitize_schema"));
  assert.match(save, /\$decoded = json_decode\(\$raw\);\s*\n\s*if \(json_last_error\(\) === JSON_ERROR_NONE && \(is_array\(\$decoded\) \|\| is_object\(\$decoded\)\)\)/);
  assert.match(php, /wp_json_encode\(json_decode\(\$schema\)/);
});

test("plugin: contains no dangerous PHP functions", () => {
  for (const fn of ["eval", "exec", "shell_exec", "system", "passthru", "proc_open", "popen", "unserialize", "assert", "create_function", "file_put_contents", "fwrite", "curl_exec", "move_uploaded_file"]) {
    assert.ok(!new RegExp(`(?<![A-Za-z_>:])${fn}\\s*\\(`).test(php.replace(/\/\/.*$/gm, "")), `${fn}() must not appear`);
  }
  assert.ok(!/\$wpdb->(query|get_results)\(\s*["'][^"']*\$/.test(php), "no raw interpolated SQL");
});

test("plugin: outbound calls only go to the https app URL and never follow redirects", () => {
  const calls = [...php.matchAll(/wp_remote_post\(([\s\S]*?)\]\);/g)];
  assert.ok(calls.length >= 2);
  for (const [, body] of calls) assert.match(body, /'redirection' => 0/);
  assert.ok(php.split("esc_url_raw(get_option('seo_studio_app_url', ''), ['https'])").length >= 4, "app URL must be restricted to https");
  assert.match(php, /\$url = esc_url_raw\(wp_unslash\(\$_POST\['seo_studio_app_url'\] \?\? ''\), \['https'\]\)/);
});

test("plugin: sync sends batches of 100, which is exactly what the app accepts per request", () => {
  assert.match(php, /count\(\$batch\) >= 100\) \$flush\(\)/);
  assert.match(syncRoute, /body\.posts\.length > 100/);
});

test("plugin: redirects only send visitors to validated http(s) targets and only for admin-saved rules", () => {
  const fn = php.slice(php.indexOf("public static function maybe_redirect"));
  assert.match(fn, /preg_match\('#\^https\?:\/\/#i', \(string\) \$target\)/);
  assert.match(fn, /wp_redirect\(esc_url_raw\(\$target, \['http', 'https'\]\)/);
  assert.match(fn, /in_array\(\$code, \[301, 302, 307, 308\], true\)/);
  const save = php.slice(php.indexOf("public static function save_redirect"), php.indexOf("public static function maybe_redirect"));
  assert.match(save, /\['http', 'https'\]/);
  assert.match(save, /\[301, 302, 307, 308\]/);
});

test("plugin: app-driven metadata changes are limited to published, public content and a fixed field list", () => {
  const fn = php.slice(php.indexOf("public static function app_update_metadata"), php.indexOf("public static function core_sitemaps_enabled"));
  assert.match(fn, /post_status !== 'publish'/);
  assert.match(fn, /is_post_type_viewable/);
  assert.match(fn, /count\(\$metadata\) > 6/);
  for (const field of ["title", "description", "canonical", "robots", "schema", "altText"]) assert.match(fn, new RegExp(`'${field}' =>`));
  assert.match(fn, /json_last_error\(\) !== JSON_ERROR_NONE/);
});

test("plugin: front-end output is escaped (descriptions, canonical, robots) and JSON-LD cannot close the script tag", () => {
  const fn = php.slice(php.indexOf("public static function render_meta"), php.indexOf("public static function filter_robots("));
  assert.match(fn, /esc_attr\(\$description\)/);
  assert.match(fn, /esc_url\(\$canonical\)/);
  assert.match(fn, /esc_attr\(\$robots\)/);
  assert.match(fn, /JSON_HEX_TAG/);
});

test("plugin: sitemap changes need an explicit approval flag and respect SEO plugins that own the sitemap", () => {
  const fn = php.slice(php.indexOf("public static function update_sitemap"), php.indexOf("public static function connection"));
  assert.match(fn, /approved'\) !== true/);
  assert.match(fn, /has_external_sitemap_owner\(\)\) return new WP_Error\('sitemap_managed_elsewhere'/);
});

test("plugin: bulk edits need a matching preview made by the same user within 10 minutes", () => {
  assert.match(php, /set_transient\('seo_studio_bulk_' \. \$token, \['userId' => get_current_user_id\(\), 'fingerprint' => \$fingerprint\], 10 \* MINUTE_IN_SECONDS\)/);
  assert.match(php, /hash_equals\(\(string\) \$preview\['fingerprint'\], \$fingerprint\)/);
  assert.match(php, /\(int\) \$preview\['userId'\] !== get_current_user_id\(\)/);
});

test("plugin: the download route ships exactly the files that exist in the plugin folder", async () => {
  const { readdirSync } = await import("node:fs");
  const listed = downloadRoute.match(/PLUGIN_FILES = \[(.*?)\]/)[1].match(/"([^"]+)"/g).map((s) => s.replaceAll('"', "")).sort();
  assert.deepEqual(listed, readdirSync("wordpress-plugin/seo-studio").sort());
});

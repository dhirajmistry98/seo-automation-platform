import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { setup } from "../support/harness.mjs";

const { GET } = await import("../../src/app/api/plugin/download/route.ts");

/** Minimal zip reader: lists entries from the central directory and inflates them. */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString();
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    out[name] = inflateRawSync(buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize));
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

test("plugin download: logged-out visitor gets 401 and no file", async () => {
  setup({ loggedIn: false });
  const res = await GET();
  assert.equal(res.status, 401);
  assert.match(res.headers.get("content-type"), /json/);
});
test("plugin download: signed-in user gets a zip with safe headers", async () => {
  setup();
  const res = await GET();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  assert.match(res.headers.get("content-disposition"), /attachment; filename="seo-studio-connector\.zip"/);
  assert.match(res.headers.get("cache-control"), /no-store/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
test("plugin download: zip installs as a seo-studio folder and files match the repo exactly", async () => {
  setup();
  const entries = readZip(Buffer.from(await (await GET()).arrayBuffer()));
  assert.deepEqual(Object.keys(entries).sort(), ["seo-studio/readme.txt", "seo-studio/seo-studio.php"]);
  for (const file of ["seo-studio.php", "readme.txt"]) {
    assert.ok(entries[`seo-studio/${file}`].equals(readFileSync(`wordpress-plugin/seo-studio/${file}`)), file);
  }
});
test("plugin download: the archive never contains env files, secrets or path traversal", async () => {
  setup();
  const names = Object.keys(readZip(Buffer.from(await (await GET()).arrayBuffer())));
  assert.ok(names.every((n) => n.startsWith("seo-studio/") && !n.includes("..") && !/\.env|secret|key/i.test(n)));
});

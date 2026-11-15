import test from "node:test";
import assert from "node:assert/strict";
import { instagramHandleMatches, normalizeInstagramHandle } from "../src/lib/marketplace/instagram-handle.ts";

test("Instagram usernames are normalized from @handles and profile links", () => {
  assert.equal(normalizeInstagramHandle("@Dhiraj.Creates"), "dhiraj.creates");
  assert.equal(normalizeInstagramHandle("  dhiraj_creates "), "dhiraj_creates");
  assert.equal(normalizeInstagramHandle("https://www.instagram.com/dhiraj.creates/"), "dhiraj.creates");
  assert.equal(normalizeInstagramHandle("instagram.com/dhiraj.creates?igsh=abc"), "dhiraj.creates");
});

test("invalid Instagram usernames are rejected", () => {
  for (const bad of ["", "@", ".dhiraj", "dhiraj.", "dhi..raj", "dhiraj creates", "dhiraj-creates", "a".repeat(31), "<script>", null, 42]) {
    assert.equal(normalizeInstagramHandle(bad), null, String(bad));
  }
});

test("verification only passes when Meta's account is the claimed username", () => {
  assert.equal(instagramHandleMatches("@Dhiraj.Creates", "dhiraj.creates"), true);
  assert.equal(instagramHandleMatches("dhiraj.creates", "someone.else"), false);
  assert.equal(instagramHandleMatches("", "dhiraj"), false);
  assert.equal(instagramHandleMatches("dhiraj", undefined), false);
});

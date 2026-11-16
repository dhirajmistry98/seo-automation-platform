import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { influencerTier } from "../src/lib/marketplace/tiers.ts";
import { isActiveCreator, statusAfterVerification } from "../src/lib/marketplace/core.ts";
import { createState, decryptToken, encryptToken, hashState } from "../src/lib/marketplace/meta.ts";
import { collaborationChannel, createCollaborationTokenRequest } from "../src/lib/marketplace/realtime.ts";
import { matchesFileSignature } from "../src/lib/marketplace/file-types.ts";

test("follower tiers are descriptive with no minimum audience", () => {
  const cases = [[null, null], [-1, null], [0, "nano"], [4999, "nano"], [9999, "nano"], [10000, "micro"], [49999, "micro"], [50000, "mid"], [99999, "mid"], [100000, "macro"], [499999, "macro"], [500000, "mega"]];
  for (const [followers, tier] of cases) assert.equal(influencerTier(followers), tier, String(followers));
  assert.equal(influencerTier(5000.5), null);
  assert.equal(influencerTier(Number.MAX_SAFE_INTEGER + 1), null);
});

test("any audience size is listed, but only with a current Meta verification of the claimed username", () => {
  const creator = (followers, overrides = {}) => ({ status: "approved", instagramHandle: "dhiraj.creates", instagram: { source: "meta_api", username: "dhiraj.creates", verifiedFollowers: followers, verifiedAt: new Date() }, ...overrides });
  for (const followers of [0, 120, 4999, 5000, 2_000_000]) assert.equal(isActiveCreator(creator(followers)), true, String(followers));
  // Not verified through Meta, stale verification, or not approved.
  assert.equal(isActiveCreator(creator(900, { instagram: { verifiedFollowers: 900, verifiedAt: null } })), false);
  assert.equal(isActiveCreator(creator(900, { instagram: { source: "meta_api", username: "dhiraj.creates", verifiedFollowers: 900, verifiedAt: new Date(Date.now() - 8 * 86_400_000) } })), false);
  assert.equal(isActiveCreator(creator(900, { status: "draft" })), false);
  // Meta verified a different account than the username on the profile.
  assert.equal(isActiveCreator(creator(900, { instagramHandle: "someone.else" })), false);
  // Verified before the username field existed: matches on the verified username.
  assert.equal(isActiveCreator(creator(900, { instagramHandle: undefined })), true);
  assert.equal(isActiveCreator(creator(900, { instagram: { source: "meta_api", verifiedFollowers: 900, verifiedAt: new Date() } })), false);
});

test("realtime token grants only private conversation read and presence capabilities", async () => {
  const previous = process.env.ABLY_API_KEY;
  process.env.ABLY_API_KEY = `app.key:${randomBytes(32).toString("base64")}`;
  try {
    const id = "507f1f77bcf86cd799439011";
    const token = await createCollaborationTokenRequest(id, "user-123");
    assert.equal(token.clientId, "user-123");
    const capabilities = JSON.parse(token.capability);
    assert.deepEqual(Object.keys(capabilities), [collaborationChannel(id)]);
    assert.deepEqual([...capabilities[collaborationChannel(id)]].sort(), ["presence", "subscribe"]);
    assert.ok(!token.capability.includes("publish"));
  } finally {
    if (previous === undefined) delete process.env.ABLY_API_KEY;
    else process.env.ABLY_API_KEY = previous;
  }
});

test("Instagram OAuth state is random and provider tokens are authenticated ciphertext", () => {
  const first = createState(), second = createState();
  assert.notEqual(first, second);
  assert.notEqual(hashState(first), first);
  const previous = process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const encrypted = encryptToken("sensitive-provider-token");
    assert.ok(!encrypted.includes("sensitive-provider-token"));
    assert.equal(decryptToken(encrypted), "sensitive-provider-token");
    assert.throws(() => decryptToken(encrypted.slice(0, -2) + "aa"));
  } finally {
    if (previous === undefined) delete process.env.META_TOKEN_ENCRYPTION_KEY;
    else process.env.META_TOKEN_ENCRYPTION_KEY = previous;
  }
});

test("private attachment upload rejects mismatched file signatures", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const pdf = new TextEncoder().encode("%PDF-1.7");
  assert.equal(matchesFileSignature("image/jpeg", jpeg), true);
  assert.equal(matchesFileSignature("application/pdf", pdf), true);
  assert.equal(matchesFileSignature("image/jpeg", pdf), false);
  assert.equal(matchesFileSignature("application/pdf", jpeg), false);
  assert.equal(matchesFileSignature("image/png", Uint8Array.from([0x89, 0x50])), false);
});

test("Meta verification lists a creator unless an admin rejected or suspended them", () => {
  for (const current of [undefined, "draft", "pending", "approved"]) assert.equal(statusAfterVerification(current), "approved", String(current));
  assert.equal(statusAfterVerification("rejected"), "rejected");
  assert.equal(statusAfterVerification("suspended"), "suspended");
});

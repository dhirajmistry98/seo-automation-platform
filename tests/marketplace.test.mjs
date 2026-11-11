import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { influencerTier } from "../src/lib/marketplace/tiers.ts";
import { isPublicEmergingCreator, isPublicInfluencer } from "../src/lib/marketplace/core.ts";
import { createState, decryptToken, encryptToken, hashState } from "../src/lib/marketplace/meta.ts";
import { collaborationChannel, createCollaborationTokenRequest } from "../src/lib/marketplace/realtime.ts";
import { matchesFileSignature } from "../src/lib/marketplace/file-types.ts";

test("Instagram eligibility uses precise half-open follower tiers", () => {
  const cases = [[null, null], [0, null], [4999, null], [5000, "nano"], [9999, "nano"], [10000, "micro"], [49999, "micro"], [50000, "mid"], [99999, "mid"], [100000, "macro"], [499999, "macro"], [500000, "mega"]];
  for (const [followers, tier] of cases) assert.equal(influencerTier(followers), tier, String(followers));
  assert.equal(influencerTier(5000.5), null);
  assert.equal(influencerTier(Number.MAX_SAFE_INTEGER + 1), null);
});

test("standard and emerging Instagram profiles remain separate eligibility tracks", () => {
  const verified = (followers, creatorTrack = "standard") => ({ status: "approved", creatorTrack, instagram: { source: "meta_api", verifiedFollowers: followers, verifiedAt: new Date() } });
  assert.equal(isPublicInfluencer(verified(4999)), false);
  assert.equal(isPublicInfluencer(verified(5000)), true);
  assert.equal(isPublicEmergingCreator(verified(4999, "emerging")), true);
  assert.equal(isPublicEmergingCreator(verified(5000, "emerging")), false);
  assert.equal(isPublicInfluencer(verified(4999, "emerging")), false);
  assert.equal(isPublicEmergingCreator(verified(5000)), false);
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

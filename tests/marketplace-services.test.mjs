import test from "node:test";
import assert from "node:assert/strict";
import { cleanServiceListing, cleanServiceProfile, cleanServiceProposal, cleanServiceRequest } from "../src/lib/marketplace/services.ts";

test("expert profiles require supported specialties and HTTPS portfolio URLs", () => {
  const valid = cleanServiceProfile({
    displayName: "Asha Mehta",
    headline: "Technical SEO and GEO strategist",
    bio: "I help growing teams improve site discovery through practical audits and evidence-based implementation plans.",
    specialties: ["Technical SEO", "GEO"],
    location: "Mumbai, India",
    experienceYears: 8,
    portfolio: ["https://example.com/case-study"],
    website: "https://example.com",
  });
  assert.ok(valid);
  assert.equal(valid.displayName, "Asha Mehta");
  assert.equal(cleanServiceProfile({ ...valid, specialties: ["Fake ranking guarantee"] }), null);
  assert.equal(cleanServiceProfile({ ...valid, portfolio: ["http://example.com"] }), null);
});

test("service listings enforce INR bounds, supported categories and delivery limits", () => {
  const valid = { title: "GEO and AEO content audit", summary: "Review important pages and provide an evidence-based action plan.", description: "The delivery includes a page sample, entity and structure checks, and a prioritized set of recommendations for your team.", category: "GEO", deliveryDays: 10, pricePaise: 2500000 };
  assert.equal(cleanServiceListing(valid)?.pricePaise, 2500000);
  assert.equal(cleanServiceListing({ ...valid, category: "Guaranteed rankings" }), null);
  assert.equal(cleanServiceListing({ ...valid, pricePaise: -1 }), null);
  assert.equal(cleanServiceListing({ ...valid, deliveryDays: 181 }), null);
});

test("customer project requests accept optional budgets and safe HTTPS websites", () => {
  const valid = { title: "Review our new product category", details: "We need a review of our product category pages, technical issues and content gaps, followed by a practical prioritized plan for implementation.", website: "https://store.example", budgetPaise: 5000000 };
  assert.equal(cleanServiceRequest(valid)?.budgetPaise, 5000000);
  assert.equal(cleanServiceRequest({ ...valid, website: "http://store.example" }), null);
  assert.equal(cleanServiceRequest({ ...valid, budgetPaise: 999999999999 }), null);
  assert.equal(cleanServiceRequest({ ...valid, details: "too short" }), null);
});

test("proposals require a bounded INR amount, scope and delivery estimate", () => {
  const valid = { message: "I can complete the agreed audit and recommendations within the planned schedule.", scope: "Review 20 pages, document technical and content findings, then deliver a prioritized action plan.", amountPaise: 900000, deliveryDays: 14 };
  assert.equal(cleanServiceProposal(valid)?.deliveryDays, 14);
  assert.equal(cleanServiceProposal({ ...valid, amountPaise: 0 }), null);
  assert.equal(cleanServiceProposal({ ...valid, deliveryDays: 0 }), null);
  assert.equal(cleanServiceProposal({ ...valid, scope: "Only a call" }), null);
});

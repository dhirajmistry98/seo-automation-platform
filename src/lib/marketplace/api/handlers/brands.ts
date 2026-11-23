import { ObjectId } from "mongodb";
import { LISTABLE_CREATOR_STATUS, BRAND_CATEGORIES, cleanList, cleanText, safeUrl } from "@/lib/marketplace/core";
import { type Handler, type ApiContext, type WriteContext } from "@/lib/marketplace/api/context";
import { json, error, record, records } from "@/lib/marketplace/api/helpers";

export const handleGet: Handler<ApiContext> = async (ctx) => {
  const { request, path, db } = ctx;
  if (path[0] === "brands" && path.length === 1) {
    const params = new URL(request.url).searchParams;
    const query = cleanText(params.get("q"), 80);
    const skip = Math.min(10_000, Math.max(0, Number.parseInt(params.get("skip") || "0", 10) || 0));
    const filter: Record<string, unknown> = { status: LISTABLE_CREATOR_STATUS };
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }, { category: { $regex: escaped, $options: "i" } }, { location: { $regex: escaped, $options: "i" } }, { offerings: { $regex: escaped, $options: "i" } }];
    }
    const total = await db.collection("mp_brands").countDocuments(filter);
    const items = await db.collection("mp_brands").find(filter, { projection: { ownerId: 0 } }).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(24).toArray();
    return json({ brands: records(items), total, hasMore: skip + items.length < total, nextSkip: skip + items.length });
  }
  return null;
};

export const handlePost: Handler<WriteContext> = async (ctx) => {
  const { userId, path, db, body, now } = ctx;
  if (path[0] === "brands" && path.length === 1) {
    const name = cleanText(body.name, 100, 2);
    const description = cleanText(body.description, 1500, 0);
    const category = BRAND_CATEGORIES.find((item) => item === body.category);
    const location = cleanText(body.location, 100);
    const website = body.website === "" || body.website == null ? null : safeUrl(body.website);
    const offerings = cleanList(body.offerings, 20);
    if (!name || description === null || !category || !location || (body.website && !website) || !offerings) return error("Provide a brand name, category, location, products or services, and a valid HTTPS website if supplied.");
    const id = new ObjectId();
    const brand = { _id: id, ownerId: userId, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${id.toHexString().slice(-6)}`, name, description, category, location, website, offerings, status: "approved", currency: "INR", createdAt: now, updatedAt: now };
    await db.collection("mp_brands").insertOne(brand);
    await db.collection("mp_brand_members").insertOne({ brandId: id, userId, role: "owner", status: "active", createdAt: now });
    await db.collection("mp_audit").insertOne({ entityId: id, actorId: userId, action: "brand.created", createdAt: now });
    return json({ brand: record(brand) }, 201);
  }
  return null;
};

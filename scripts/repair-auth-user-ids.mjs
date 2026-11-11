import { MongoClient, ObjectId } from "mongodb";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required.");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
  const db = client.db();
  const users = db.collection("users");
  const archive = db.collection("auth_user_repair_archive");
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name)
    .filter((name) => !name.startsWith("system.") && name !== "users" && name !== "auth_user_repair_archive");
  const referenceFields = ["userId", "ownerId", "actorId", "createdBy", "updatedBy", "assigneeId", "personalOwnerId", "invitedBy"];
  const candidates = await users.find({ _id: { $type: "string" } }).toArray();
  let eligible = 0;
  for (const candidate of candidates) {
    if (typeof candidate.email !== "string") continue;
    const realUser = await users.findOne({ _id: { $type: "objectId" }, email: candidate.email }, { projection: { _id: 1 } });
    if (!realUser || !(realUser._id instanceof ObjectId)) continue;
    const references = { $or: referenceFields.map((field) => ({ [field]: candidate._id })) };
    let referenced = false;
    for (const name of collections) {
      if (await db.collection(name).countDocuments(references, { limit: 1 })) { referenced = true; break; }
    }
    if (referenced) continue;
    eligible++;
    if (!apply) continue;
    await archive.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "auth_repair_archive_expiry" });
    await archive.createIndex({ originalId: 1 }, { unique: true, name: "auth_repair_original_id_unique" });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await users.findOne({ _id: candidate._id, email: candidate.email }, { session });
        if (!current) return;
        await archive.updateOne({ originalId: candidate._id }, { $setOnInsert: {
          originalId: candidate._id, email: candidate.email, user: current,
          reason: "Unreferenced duplicate string-ID user created before OAuth account linking",
          archivedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400_000),
        } }, { upsert: true, session });
        await users.deleteOne({ _id: candidate._id, email: candidate.email }, { session });
      });
    } finally { await session.endSession(); }
  }
  console.log(JSON.stringify({ database: db.databaseName, stringIdCandidates: candidates.length, eligibleUnreferencedDuplicates: eligible, applied: apply }));
} finally {
  await client.close();
}

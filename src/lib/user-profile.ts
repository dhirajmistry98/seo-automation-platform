import { ObjectId, type Db } from "mongodb";

export type UserProfileInput = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
  provider: string;
  now?: Date;
};

function safeProfileImage(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href.slice(0, 2048) : null;
  } catch {
    return null;
  }
}

export async function persistUserProfile(db: Db, input: UserProfileInput) {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase().slice(0, 320);
  if (!ObjectId.isValid(input.id) || !email) throw new Error("A MongoDB user ID and email are required to persist an account profile.");
  const name = input.name?.trim().slice(0, 150) || email.split("@")[0];
  const userId = input.id.slice(0, 128);
  const _id = new ObjectId(userId);
  const profileFields = {
    email,
    name,
    image: safeProfileImage(input.image),
    ...(input.emailVerified instanceof Date ? { emailVerified: input.emailVerified } : {}),
    lastLoginAt: now,
    lastLoginProvider: input.provider.slice(0, 40),
    profileUpdatedAt: now,
    updatedAt: now,
  };
  const result = await db.collection<{ _id: ObjectId | string }>("users").updateOne(
    { _id },
    {
      $set: profileFields,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return { userId, modified: result.modifiedCount, created: result.upsertedCount > 0 };
}

export async function ensureSessionUserProfile(db: Db, input: Omit<UserProfileInput, "provider" | "now">) {
  const now = new Date();
  const email = input.email.trim().toLowerCase().slice(0, 320);
  if (!ObjectId.isValid(input.id) || !email) throw new Error("A MongoDB user ID and email are required to persist an account profile.");
  const userId = input.id.slice(0, 128);
  const _id = new ObjectId(userId);
  const fields = {
    email,
    name: input.name?.trim().slice(0, 150) || email.split("@")[0],
    image: safeProfileImage(input.image),
    ...(input.emailVerified instanceof Date ? { emailVerified: input.emailVerified } : {}),
  };
  const result = await db.collection<{ _id: ObjectId | string }>("users").updateOne(
    { _id },
    { $set: fields, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  return { userId, modified: result.modifiedCount, created: result.upsertedCount > 0 };
}

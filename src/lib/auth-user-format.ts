import { format as mongoAdapterFormat } from "@auth/mongodb-adapter";
import { ObjectId, type Document } from "mongodb";
import type { AdapterUser } from "next-auth/adapters";

export function formatAuthUser(document: Document): AdapterUser {
  const objectId = document._id instanceof ObjectId
    ? document._id
    : ObjectId.isValid(String(document._id))
      ? new ObjectId(String(document._id))
      : null;
  if (!objectId) throw new Error("Auth.js user record has an invalid MongoDB ID.");

  const fields = { ...document };
  delete fields._id;
  delete fields.userId;
  return mongoAdapterFormat.from<AdapterUser>({ _id: objectId, ...fields });
}

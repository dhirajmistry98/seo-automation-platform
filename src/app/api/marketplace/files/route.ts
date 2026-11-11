import { GridFSBucket, ObjectId } from "mongodb";
import { auth } from "@/auth";
import clientPromise from "@/lib/mongodb";
import { collaborationAccess, objectId } from "@/lib/marketplace/core";
import { MARKETPLACE_FILE_TYPES, MAX_MARKETPLACE_FILE_BYTES, matchesFileSignature } from "@/lib/marketplace/file-types";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isAllowedBodySize, isSameOriginRequest, sameOriginError } from "@/lib/security/request";

type ServiceRequestAttachment = { id: string; name: string; type: string; size: number; uploadedAt: Date; uploadedBy?: string };
type ServiceRequestRecord = { _id: ObjectId; clientUserId?: string; expertUserId?: string; status?: string; attachments?: ServiceRequestAttachment[]; updatedAt?: Date };
const bad = (message: string, status = 400) => Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

function fileName(value: string | null) {
  const cleaned = (value || "attachment").replace(/[^a-zA-Z0-9 .()_-]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  return cleaned || "attachment";
}

async function readFile(request: Request) {
  if (!isAllowedBodySize(request, MAX_MARKETPLACE_FILE_BYTES) || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_MARKETPLACE_FILE_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return length ? Buffer.concat(chunks, length) : null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return sameOriginError();
  const session = await auth(); if (!session?.user?.id) return bad("Authentication required.", 401);
  const params = new URL(request.url).searchParams;
  const collaborationId = objectId(params.get("collaborationId"));
  const serviceRequestId = objectId(params.get("serviceRequestId"));
  if (Boolean(collaborationId) === Boolean(serviceRequestId)) return bad("Provide exactly one collaboration or service request ID.");
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!MARKETPLACE_FILE_TYPES.has(type)) return bad("Use a JPEG, PNG, WebP, MP4, or PDF file.", 415);
  const db = (await clientPromise).db();
  if (collaborationId) {
    const access = await collaborationAccess(db, collaborationId, session.user.id);
    if (!access) return bad("Collaboration access required.", 403);
    if (access.role === "brand" && !["owner", "admin", "editor"].includes(String(access.member?.role))) return bad("Brand edit access required.", 403);
  } else if (serviceRequestId) {
    const serviceRequest = await db.collection("service_requests").findOne({
      _id: serviceRequestId,
      $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }],
      status: { $in: ["open", "accepted"] },
    }, { projection: { _id: 1 } });
    if (!serviceRequest) return bad("Active service request access required.", 404);
  } else {
    return bad("Invalid service request ID.");
  }
  const limit = await consumeRateLimit(db, "marketplace-upload", session.user.id, 6, 3_600_000);
  if (!limit.allowed) return bad("Upload limit reached. Try again later.", 429);
  const data = await readFile(request);
  if (!data) return bad("Upload a file smaller than 10 MB.", 413);
  if (!matchesFileSignature(type, data)) return bad("File contents do not match the selected type.", 415);
  const filename = fileName(request.headers.get("x-file-name"));
  const bucket = new GridFSBucket(db, { bucketName: "mp_uploads" });
  const now = new Date();
  const upload = bucket.openUploadStream(filename, { metadata: {
    ...(collaborationId ? { collaborationId } : {}),
    ...(serviceRequestId ? { serviceRequestId } : {}),
    uploadedBy: session.user.id,
    originalType: type,
    createdAt: now,
  } });
  await new Promise<void>((resolve, reject) => { upload.once("finish", () => resolve()); upload.once("error", reject); upload.end(data); });
  const uploadedFile = { id: String(upload.id), name: filename, type, size: data.length, uploadedAt: now };
  if (serviceRequestId) {
    const attached = await db.collection<ServiceRequestRecord>("service_requests").updateOne({
      _id: serviceRequestId,
      $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }],
      status: { $in: ["open", "accepted"] },
      $expr: { $lt: [{ $size: { $ifNull: ["$attachments", []] } }, 20] },
    }, { $push: { attachments: { ...uploadedFile, uploadedBy: session.user.id } }, $set: { updatedAt: now } });
    if (!attached.modifiedCount) {
      await bucket.delete(upload.id).catch(() => undefined);
      return bad("The request is no longer available or already has 20 attachments.", 409);
    }
  }
  return Response.json({ file: uploadedFile }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const session = await auth(); if (!session?.user?.id) return bad("Authentication required.", 401);
  const params = new URL(request.url).searchParams;
  const id = objectId(params.get("fileId"));
  const collaborationId = objectId(params.get("collaborationId"));
  const serviceRequestId = objectId(params.get("serviceRequestId"));
  if (!id) return bad("Invalid file ID.");
  if (collaborationId && serviceRequestId) return bad("Provide only one collaboration or service request ID.");
  const db = (await clientPromise).db();
  const file = await db.collection("mp_uploads.files").findOne({ _id: id });
  const metadata = file?.metadata as { collaborationId?: ObjectId; serviceRequestId?: ObjectId; originalType?: string } | undefined;
  let authorized = false;
  if (file && metadata?.collaborationId && !serviceRequestId && (!collaborationId || metadata.collaborationId.equals(collaborationId))) {
    // Older collaboration message links contain only fileId. Resolve the private scope from GridFS metadata.
    authorized = Boolean(await collaborationAccess(db, metadata.collaborationId, session.user.id));
  } else if (file && serviceRequestId && metadata?.serviceRequestId?.equals(serviceRequestId)) {
    authorized = Boolean(await db.collection("service_requests").findOne({
      _id: serviceRequestId,
      $or: [{ clientUserId: session.user.id }, { expertUserId: session.user.id }],
    }, { projection: { _id: 1 } }));
  }
  if (!file || !authorized) return bad("File not found.", 404);
  if (!Number.isSafeInteger(file.length) || file.length <= 0 || file.length > MAX_MARKETPLACE_FILE_BYTES) return bad("File is unavailable.", 410);
  const chunks = await db.collection("mp_uploads.chunks").find({ files_id: id }).sort({ n: 1 }).toArray();
  const content = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data.buffer)));
  if (content.length !== file.length) return bad("File is unavailable.", 410);
  const contentType = metadata?.originalType && MARKETPLACE_FILE_TYPES.has(metadata.originalType) ? metadata.originalType : "application/octet-stream";
  return new Response(new Uint8Array(content), { headers: { "Content-Type": contentType, "Content-Length": String(file.length), "Content-Disposition": `attachment; filename="${fileName(file.filename)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}

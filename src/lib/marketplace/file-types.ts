export const MAX_MARKETPLACE_FILE_BYTES = 10 * 1024 * 1024;
export const MARKETPLACE_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "application/pdf"]);

export function matchesFileSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  if (type === "video/mp4") return bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString() === "ftyp";
  if (type === "application/pdf") return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  return false;
}

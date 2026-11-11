import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";

export type PublicAddress = { address: string; family: 4 | 6 };

function isPublicAddress(address: string) {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 192 && b === 88 && Number(address.split(".")[2]) === 99) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  if (ipVersion === 6) {
    const groups = address.toLowerCase().split("::");
    const left = groups[0] ? groups[0].split(":") : [];
    const right = groups[1] ? groups[1].split(":") : [];
    const expanded = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
    const firstGroup = parseInt(expanded[0] || "0", 16);
    const secondGroup = parseInt(expanded[1] || "0", 16);
    const documentationRange = firstGroup === 0x3fff && (secondGroup & 0xf000) === 0;
    const special2001Range = firstGroup === 0x2001 && (secondGroup <= 0x01ff || secondGroup === 0x0db8);
    return firstGroup >= 0x2000 && firstGroup <= 0x3fff && !special2001Range && !documentationRange && firstGroup !== 0x2002;
  }
  return false;
}

export async function resolvePublicUrl(value: string): Promise<{ url: URL; addresses: PublicAddress[] }> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("Only public HTTP or HTTPS pages can be crawled.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private network destinations are blocked.");
  let addresses: PublicAddress[];
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error("Private network destinations are blocked.");
    addresses = [{ address: host, family: isIP(host) as 4 | 6 }];
  } else {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) throw new Error("The site resolves to a private or restricted network address.");
    addresses = records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
  }
  return { url, addresses };
}

export async function assertPublicUrl(value: string) {
  return (await resolvePublicUrl(value)).url;
}

export function createPinnedLookup(expectedHostname: string, addresses: PublicAddress[]) {
  return (hostname: string, options: LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    if (hostname.toLowerCase().replace(/^\[|\]$/g, "") !== expectedHostname.toLowerCase().replace(/^\[|\]$/g, "") || !addresses.length) {
      callback(Object.assign(new Error("The connection hostname did not match its validated DNS lookup."), { code: "EACCES" }), "", 0);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
}

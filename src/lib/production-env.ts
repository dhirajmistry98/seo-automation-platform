function validPair(first: string | undefined, second: string | undefined, label: string) {
  if (Boolean(first) !== Boolean(second)) throw new Error(`${label} must be configured as a complete pair.`);
}

function validateEncryptionKey(value: string | undefined, name: string) {
  if (!value) return;
  if (Buffer.from(value, "base64").length !== 32) {
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
}

function parseMongoConnectionString(uri: string) {
  const prefix = uri.startsWith("mongodb+srv://") ? "mongodb+srv://" : uri.startsWith("mongodb://") ? "mongodb://" : "";
  if (!prefix) throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  const remainder = uri.slice(prefix.length);
  const queryStart = remainder.indexOf("?");
  const addressAndPath = queryStart < 0 ? remainder : remainder.slice(0, queryStart);
  const searchParams = new URLSearchParams(queryStart < 0 ? "" : remainder.slice(queryStart + 1));
  const pathStart = addressAndPath.indexOf("/");
  const authority = pathStart < 0 ? addressAndPath : addressAndPath.slice(0, pathStart);
  const hostList = authority.slice(authority.lastIndexOf("@") + 1).split(",");
  if (!authority || hostList.some((host) => !host || /\s/.test(host))) {
    throw new Error("MONGODB_URI must contain a valid MongoDB host.");
  }
  const hostnames = hostList.map((entry) => {
    if (entry.startsWith("[")) {
      const close = entry.indexOf("]");
      if (close < 0 || (entry.slice(close + 1) && !/^:\d+$/.test(entry.slice(close + 1)))) throw new Error("MONGODB_URI contains an invalid host.");
      return entry.slice(0, close + 1);
    }
    const colon = entry.lastIndexOf(":");
    const host = colon > 0 && /^\d+$/.test(entry.slice(colon + 1)) ? entry.slice(0, colon) : entry;
    if (host.includes(":")) throw new Error("MONGODB_URI contains an invalid host.");
    return host;
  });
  return {
    protocol: prefix.slice(0, -2),
    hostnames,
    searchParams,
  };
}

export function assertProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters in production.");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required in production.");
  let parsedAppUrl: URL;
  try { parsedAppUrl = new URL(appUrl); } catch { throw new Error("NEXT_PUBLIC_APP_URL must be a valid origin in production."); }
  const localOrigin = ["localhost", "127.0.0.1", "::1"].includes(parsedAppUrl.hostname);
  if (parsedAppUrl.username || parsedAppUrl.password || parsedAppUrl.pathname !== "/" || parsedAppUrl.search || parsedAppUrl.hash || (!localOrigin && parsedAppUrl.protocol !== "https:")) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTPS origin in production (localhost is allowed for local builds).");
  }

  validPair(process.env.RESEND_API_KEY, process.env.AUTH_EMAIL_FROM, "RESEND_API_KEY and AUTH_EMAIL_FROM");
  validPair(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET, "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET");
  validPair(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET");
  if (!(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM) && !(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)) {
    throw new Error("Configure at least one production sign-in provider: Resend email OTP or Google OAuth.");
  }
  const googleReportingConfigured = Boolean(
    (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) ||
    (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  );
  if (googleReportingConfigured && !process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required when Google reporting connections are enabled.");
  }
  validateEncryptionKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY, "GOOGLE_TOKEN_ENCRYPTION_KEY");
  validateEncryptionKey(process.env.MFA_ENCRYPTION_KEY, "MFA_ENCRYPTION_KEY");
  validateEncryptionKey(process.env.WORDPRESS_TOKEN_ENCRYPTION_KEY, "WORDPRESS_TOKEN_ENCRYPTION_KEY");
  validPair(process.env.META_INSTAGRAM_APP_ID, process.env.META_INSTAGRAM_APP_SECRET, "META_INSTAGRAM_APP_ID and META_INSTAGRAM_APP_SECRET");
  if (process.env.META_INSTAGRAM_APP_ID && !process.env.META_TOKEN_ENCRYPTION_KEY) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY is required when Instagram verification is enabled.");
  }
  validateEncryptionKey(process.env.META_TOKEN_ENCRYPTION_KEY, "META_TOKEN_ENCRYPTION_KEY");
  if (process.env.META_INSTAGRAM_APP_ID && !/^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || "")) {
    throw new Error("META_GRAPH_API_VERSION must use a version such as v25.0.");
  }
  if (process.env.ABLY_API_KEY && !/^[^.\s:]+\.[^.\s:]+:[^\s:]+$/.test(process.env.ABLY_API_KEY)) {
    throw new Error("ABLY_API_KEY must be a valid server API key.");
  }
  validPair(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) {
    throw new Error("CRON_SECRET must contain at least 32 characters when scheduled audits are enabled.");
  }
  if (!process.env.TRUSTED_CLIENT_IP_HEADER || !/^[a-z0-9-]{1,64}$/i.test(process.env.TRUSTED_CLIENT_IP_HEADER)) {
    throw new Error("Set TRUSTED_CLIENT_IP_HEADER to the client-IP header that your trusted reverse proxy overwrites.");
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required in production.");
  let parsedMongoUri: ReturnType<typeof parseMongoConnectionString>;
  try { parsedMongoUri = parseMongoConnectionString(mongoUri); } catch { throw new Error("MONGODB_URI must be a valid MongoDB URI."); }
  const localHosts = ["localhost", "127.0.0.1", "::1"];
  const localMongo = parsedMongoUri.hostnames.every((hostname) => localHosts.includes(hostname.replace(/^\[|\]$/g, "").toLowerCase()));
  const tlsEnabled = parsedMongoUri.protocol === "mongodb+srv:" || ["true", "1"].includes((parsedMongoUri.searchParams.get("tls") || parsedMongoUri.searchParams.get("ssl") || "").toLowerCase());
  if (!localMongo && !tlsEnabled) throw new Error("Production MongoDB connections must use mongodb+srv or explicitly enable TLS.");
}

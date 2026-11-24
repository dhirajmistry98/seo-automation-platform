// Route-test harness: swaps the app's real login, database, rate limiter and site-access checks for
// controllable fakes, so API route handlers run end to end without a real account or database.
// tsx loads the app's TypeScript through Node's CommonJS loader, so the swap happens there.
// Run with:  npm run test:routes
import Module from "node:module";
import { join } from "node:path";

const stubs = {
  "@/auth": "auth.cjs",
  "@/lib/mongodb": "mongodb.cjs",
  "@/lib/organizations": "organizations.cjs",
  "@/lib/security/rate-limit": "rate-limit.cjs",
  "@/lib/seo/indexes": "indexes.cjs",
  "@/lib/integrations/free-research": "free-research.cjs",
};
const dir = join(import.meta.dirname, "stubs");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return join(dir, stubs[request]);
  return original.call(this, request, ...rest);
};

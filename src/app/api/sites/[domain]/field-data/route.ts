import { guardSitePost, failure, noStore } from "@/lib/security/site-request";
import { parseCruxHistory, type CruxRecord } from "@/lib/integrations/crux";

type Context = { params: Promise<{ domain: string }> };

export async function POST(request: Request, context: Context) {
  const guard = await guardSitePost<{ formFactor?: unknown }>(request, context.params, { permission: "reports.read", bucket: "field-data", limit: 20 });
  if (guard.response) return guard.response;
  const { website, domain, body } = guard;
  const key = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!key) return failure("Field data needs the Google API key used for PageSpeed.", 503);
  const formFactor = body.formFactor === "DESKTOP" ? "DESKTOP" : "PHONE";
  let origin: string;
  try { origin = new URL(typeof website.url === "string" ? website.url : `https://${domain}`).origin; } catch { origin = `https://${domain}`; }
  let response: Response;
  try {
    response = await fetch("https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ origin, formFactor }) });
  } catch { return failure("The Chrome UX Report did not respond. Try again shortly.", 502); }
  if (response.status === 404) return Response.json({ origin, formFactor, metrics: [], message: "Google has no field data for this site yet. It needs enough real Chrome visitors." }, { headers: noStore });
  if (response.status === 403) return failure("Google refused the request. Enable the “Chrome UX Report API” for your Google API key.", 502);
  if (!response.ok) return failure(`The Chrome UX Report returned an error (${response.status}).`, 502);
  return Response.json({ origin, formFactor, metrics: parseCruxHistory((await response.json().catch(() => ({}))) as CruxRecord) }, { headers: noStore });
}

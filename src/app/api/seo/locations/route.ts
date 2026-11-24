import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** Country and language choices for research. A fixed list: no paid location provider is used. */
const STATIC_COUNTRIES = [
  { locationCode: 2356, countryCode: "IN", name: "India", languages: [{ code: "en", name: "English" }, { code: "hi", name: "Hindi" }] },
  { locationCode: 2840, countryCode: "US", name: "United States", languages: [{ code: "en", name: "English" }, { code: "es", name: "Spanish" }] },
  { locationCode: 2826, countryCode: "GB", name: "United Kingdom", languages: [{ code: "en", name: "English" }] },
  { locationCode: 2036, countryCode: "AU", name: "Australia", languages: [{ code: "en", name: "English" }] },
  { locationCode: 2124, countryCode: "CA", name: "Canada", languages: [{ code: "en", name: "English" }, { code: "fr", name: "French" }] },
  { locationCode: 2276, countryCode: "DE", name: "Germany", languages: [{ code: "de", name: "German" }] },
  { locationCode: 2250, countryCode: "FR", name: "France", languages: [{ code: "fr", name: "French" }] },
  { locationCode: 2380, countryCode: "IT", name: "Italy", languages: [{ code: "it", name: "Italian" }] },
  { locationCode: 2724, countryCode: "ES", name: "Spain", languages: [{ code: "es", name: "Spanish" }] },
  { locationCode: 2528, countryCode: "NL", name: "Netherlands", languages: [{ code: "nl", name: "Dutch" }] },
  { locationCode: 2056, countryCode: "BE", name: "Belgium", languages: [{ code: "nl", name: "Dutch" }, { code: "fr", name: "French" }] },
  { locationCode: 2756, countryCode: "CH", name: "Switzerland", languages: [{ code: "de", name: "German" }, { code: "fr", name: "French" }] },
  { locationCode: 2040, countryCode: "AT", name: "Austria", languages: [{ code: "de", name: "German" }] },
  { locationCode: 2616, countryCode: "PL", name: "Poland", languages: [{ code: "pl", name: "Polish" }] },
  { locationCode: 2792, countryCode: "TR", name: "Turkey", languages: [{ code: "tr", name: "Turkish" }] },
  { locationCode: 2643, countryCode: "RU", name: "Russia", languages: [{ code: "ru", name: "Russian" }] },
  { locationCode: 2076, countryCode: "BR", name: "Brazil", languages: [{ code: "pt", name: "Portuguese" }] },
  { locationCode: 2484, countryCode: "MX", name: "Mexico", languages: [{ code: "es", name: "Spanish" }] },
  { locationCode: 2032, countryCode: "AR", name: "Argentina", languages: [{ code: "es", name: "Spanish" }] },
  { locationCode: 2152, countryCode: "CL", name: "Chile", languages: [{ code: "es", name: "Spanish" }] },
  { locationCode: 2156, countryCode: "CN", name: "China", languages: [{ code: "zh", name: "Chinese" }] },
  { locationCode: 2392, countryCode: "JP", name: "Japan", languages: [{ code: "ja", name: "Japanese" }] },
  { locationCode: 2410, countryCode: "KR", name: "South Korea", languages: [{ code: "ko", name: "Korean" }] },
  { locationCode: 2360, countryCode: "ID", name: "Indonesia", languages: [{ code: "id", name: "Indonesian" }] },
  { locationCode: 2458, countryCode: "MY", name: "Malaysia", languages: [{ code: "ms", name: "Malay" }, { code: "en", name: "English" }] },
  { locationCode: 2608, countryCode: "PH", name: "Philippines", languages: [{ code: "en", name: "English" }, { code: "tl", name: "Filipino" }] },
  { locationCode: 2702, countryCode: "SG", name: "Singapore", languages: [{ code: "en", name: "English" }] },
  { locationCode: 2764, countryCode: "TH", name: "Thailand", languages: [{ code: "th", name: "Thai" }] },
  { locationCode: 2704, countryCode: "VN", name: "Vietnam", languages: [{ code: "vi", name: "Vietnamese" }] },
  { locationCode: 2050, countryCode: "BD", name: "Bangladesh", languages: [{ code: "bn", name: "Bengali" }] },
  { locationCode: 2586, countryCode: "PK", name: "Pakistan", languages: [{ code: "ur", name: "Urdu" }, { code: "en", name: "English" }] },
  { locationCode: 2404, countryCode: "KE", name: "Kenya", languages: [{ code: "en", name: "English" }] },
  { locationCode: 2566, countryCode: "NG", name: "Nigeria", languages: [{ code: "en", name: "English" }] },
  { locationCode: 2710, countryCode: "ZA", name: "South Africa", languages: [{ code: "en", name: "English" }, { code: "af", name: "Afrikaans" }] },
  { locationCode: 2818, countryCode: "EG", name: "Egypt", languages: [{ code: "ar", name: "Arabic" }] },
  { locationCode: 2682, countryCode: "SA", name: "Saudi Arabia", languages: [{ code: "ar", name: "Arabic" }] },
  { locationCode: 2784, countryCode: "AE", name: "United Arab Emirates", languages: [{ code: "ar", name: "Arabic" }, { code: "en", name: "English" }] },
  { locationCode: 2376, countryCode: "IL", name: "Israel", languages: [{ code: "he", name: "Hebrew" }] },
  { locationCode: 2792, countryCode: "TK", name: "Turkey", languages: [{ code: "tr", name: "Turkish" }] },
  { locationCode: 2554, countryCode: "NZ", name: "New Zealand", languages: [{ code: "en", name: "English" }] },
];

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Authentication required." }, 401);
  const kind = new URL(request.url).searchParams.get("kind") || "countries";
  if (kind === "search") return json({ locations: [] });
  return json({ countries: STATIC_COUNTRIES });
}

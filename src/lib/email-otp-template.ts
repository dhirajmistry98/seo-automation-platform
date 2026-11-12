import { BRAND } from "@/lib/marketing";

const NAVY = "#080706";
const CREAM = "#F3EFEA";
const CORAL = "#FF6A00";
const MUTED = "#6B625A";

function appOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "").origin;
  } catch {
    return "";
  }
}

/**
 * Branded sign-in code email. `code` must be the six-digit numeric code; `email` is the normalized recipient.
 * Email clients block scripts, so the copy icon links to the login page with the code in the URL fragment
 * (never sent to servers or link scanners); the form fills it in and the user still clicks Verify.
 */
export function buildSignInCodeEmail(code: string, email: string | undefined, expiresAt: Date, ttlMs: number) {
  const origin = appOrigin();
  const minutes = Math.round(ttlMs / 60_000);
  const expiry = `&amp;exp=${Math.floor(expiresAt.getTime() / 1000)}`;
  const fillUrl = origin && /^\d{6}$/.test(code)
    ? `${origin}/login#otp=${code}${email ? `&amp;email=${encodeURIComponent(email)}` : ""}${expiry}`
    : "";
  // Code first in the subject so Gmail / Apple Mail / iOS / Android detect it and offer their own "Copy code" action.
  const subject = `${code} is your ${BRAND.name} sign-in code`;

  const text = [
    `${BRAND.name} — ${BRAND.descriptor}`,
    "",
    `Your sign-in code is: ${code}`,
    "",
    `It expires in ${minutes} minutes and can only be used once.`,
    "If you didn't try to sign in, you can safely ignore this email.",
    fillUrl ? `\nSign in with the code filled in: ${fillUrl.replaceAll("&amp;", "&")}` : "",
  ].join("\n");

  // Text mark instead of a remote image: remote images and extra links raise spam scores.
  const logo = `<div style="width:40px;height:40px;line-height:40px;border-radius:10px;background:${NAVY};color:${CORAL};font-size:18px;font-weight:800;text-align:center;">S</div>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${NAVY};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your code expires in ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="padding:0 4px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">${logo}</td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:16px;font-weight:700;letter-spacing:.04em;color:${NAVY};">${BRAND.name}</div>
              <div style="font-size:12px;color:${MUTED};margin-top:2px;">${BRAND.descriptor}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#FFFDFA;border:1px solid #E7DED4;border-radius:16px;padding:32px 28px;">
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:600;color:${NAVY};">Your sign-in code</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${MUTED};">Enter this code on the ${BRAND.name} sign-in page to continue.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:12px;"><tr>
            <td style="padding:18px 8px 18px 20px;text-align:center;">
              <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${CORAL};-webkit-user-select:all;user-select:all;">${code}</span>
            </td>
            ${fillUrl ? `<td width="56" style="padding:0 14px 0 0;vertical-align:middle;">
              <a href="${fillUrl}" title="Use this code" style="display:block;width:44px;height:44px;line-height:44px;border-radius:10px;background:#1E1A17;border:1px solid #3A322C;color:#FFFFFF;font-size:22px;text-align:center;text-decoration:none;">&#10697;</a>
            </td>` : ""}
          </tr></table>
          ${fillUrl ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">Click the copy icon to open ${BRAND.name} with this code filled in.</p>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #EFE7DE;">
            <tr><td style="padding-top:16px;font-size:13px;line-height:1.6;color:${MUTED};">Expires in <strong style="color:${NAVY};">${minutes} minutes</strong> and works only once.</td></tr>
            <tr><td style="padding-top:6px;font-size:13px;line-height:1.6;color:${MUTED};">Never share this code. ${BRAND.name} will never ask for it.</td></tr>
            <tr><td style="padding-top:6px;font-size:13px;line-height:1.6;color:${MUTED};">Didn't try to sign in? You can safely ignore this email.</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
          ${BRAND.name} &middot; ${BRAND.tagline}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

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

/** Branded sign-in code email. `code` must be the six-digit numeric code (no user-controlled text). */
export function buildSignInCodeEmail(code: string) {
  const origin = appOrigin();
  const logoUrl = origin ? `${origin}/seo-studio-icon.png` : "";
  const spacedCode = code.split("").join(" ");
  const subject = `Your ${BRAND.name} sign-in code`;

  const text = [
    `${BRAND.name} — ${BRAND.descriptor}`,
    "",
    `Your sign-in code is: ${code}`,
    "",
    "It expires in 10 minutes and can only be used once.",
    "If you didn't try to sign in, you can safely ignore this email.",
    origin ? `\n${origin}` : "",
  ].join("\n");

  const logo = logoUrl
    ? `<img src="${logoUrl}" width="40" height="40" alt="${BRAND.name}" style="display:block;width:40px;height:40px;border-radius:10px;border:0;" />`
    : `<div style="width:40px;height:40px;border-radius:10px;background:${NAVY};"></div>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${NAVY};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your code expires in 10 minutes.</div>
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
          <div style="background:${NAVY};border-radius:12px;padding:20px 12px;text-align:center;">
            <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:${CORAL};">${spacedCode}</span>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">This code expires in <strong style="color:${NAVY};">10 minutes</strong> and can only be used once. If you didn't try to sign in, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
          ${origin ? `<a href="${origin}" style="color:${MUTED};text-decoration:underline;">${new URL(origin).host}</a><br>` : ""}
          ${BRAND.tagline}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

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
  const loginUrl = origin ? `${origin}/login` : "";
  // Code first in the subject so Gmail / Apple Mail / iOS / Android detect it and offer their own "Copy code" action.
  const subject = `${code} is your ${BRAND.name} sign-in code`;

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
            <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:12px;padding-left:12px;color:${CORAL};-webkit-user-select:all;user-select:all;">${code}</span>
          </div>
          <p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">&#128203;&nbsp; Double-click or long-press the code to copy it.</p>
          ${loginUrl ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td align="center">
            <a href="${loginUrl}" style="display:inline-block;background:${CORAL};color:${NAVY};font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 22px;">Open sign-in page &rarr;</a>
          </td></tr></table>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #EFE7DE;">
            <tr><td style="padding-top:16px;font-size:13px;line-height:1.6;color:${MUTED};">&#9201;&nbsp; Expires in <strong style="color:${NAVY};">10 minutes</strong> and works only once.</td></tr>
            <tr><td style="padding-top:6px;font-size:13px;line-height:1.6;color:${MUTED};">&#128274;&nbsp; Never share this code. ${BRAND.name} will never ask for it.</td></tr>
            <tr><td style="padding-top:6px;font-size:13px;line-height:1.6;color:${MUTED};">&#9993;&#65039;&nbsp; Didn't try to sign in? You can safely ignore this email.</td></tr>
          </table>
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

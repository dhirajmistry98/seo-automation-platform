type TransactionalEmail = { to: string; subject: string; text: string; html: string };

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

export function buildOrganizationInvitationEmail(organizationName: string, role: string, invitationUrl: string) {
  const organization = escapeEmailHtml(organizationName);
  const roleLabel = role.replaceAll("_", " ");
  const safeRole = escapeEmailHtml(roleLabel);
  const safeUrl = escapeEmailHtml(invitationUrl);
  return {
    subject: "You’re invited to join an SEO Studio workspace",
    text: "You’ve been invited to join " + organizationName + " as a " + roleLabel + ". Accept your invitation within 7 days: " + invitationUrl,
    html: '<div style="font-family:Arial,sans-serif;color:#201b16;max-width:560px;margin:auto;padding:28px"><p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#e95b00">SEO STUDIO</p><h1 style="font-size:24px">You’re invited to a workspace</h1><p>You’ve been invited to join <strong>' + organization + '</strong> as a <strong>' + safeRole + '</strong>.</p><p>This invitation expires in 7 days.</p><p style="margin:28px 0"><a href="' + safeUrl + '" style="background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px">Accept invitation</a></p><p style="font-size:12px;color:#6b625a">If the button does not work, copy this link into your browser:<br>' + safeUrl + '</p></div>',
  };
}

export async function sendTransactionalEmail(email: TransactionalEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !sender) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

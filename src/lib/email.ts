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

/** Gmail (or Google Workspace) SMTP: sends to any recipient without owning a domain. Needs a Google App Password. */
function gmailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  return user && password ? { user, password } : null;
}

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.AUTH_EMAIL_FROM;
  return apiKey && sender ? { apiKey, sender } : null;
}

/** True when at least one delivery method (Gmail SMTP or Resend) is configured. */
export function emailDeliveryConfigured() {
  return Boolean(gmailConfig() || resendConfig());
}

function senderName() {
  const configured = process.env.AUTH_EMAIL_FROM?.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  return (configured || "SEO Studio").replace(/[\r\n"<>]/g, "");
}

async function sendWithGmail(config: { user: string; password: string }, email: TransactionalEmail) {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({
      from: { name: senderName(), address: config.user },
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return true;
  } catch (error) {
    console.error("Gmail SMTP delivery failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    transport.close();
  }
}

async function sendWithResend(config: { apiKey: string; sender: string }, email: TransactionalEmail) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.sender, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("Resend delivery failed:", response.status, (await response.text()).slice(0, 300));
    return response.ok;
  } catch (error) {
    console.error("Resend delivery failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Sends via Gmail SMTP when configured, otherwise via Resend. Returns false when nothing is configured or delivery fails. */
export async function sendTransactionalEmail(email: TransactionalEmail) {
  const gmail = gmailConfig();
  if (gmail) return sendWithGmail(gmail, email);
  const resend = resendConfig();
  if (resend) return sendWithResend(resend, email);
  return false;
}

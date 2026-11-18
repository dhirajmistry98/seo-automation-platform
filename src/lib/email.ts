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

/** Name shown as the sender: the same brand name the emails use, so the sender and the content match. */
export const EMAIL_SENDER_NAME = "SEO Studio";

/** Domains that can never pass SPF/DKIM for us (documentation placeholders and local names). */
const PLACEHOLDER_SENDER_DOMAIN = /(^|\.)(example\.(com|org|net)|localhost|test|invalid|local)$/i;

/**
 * The Resend sender address, or null when AUTH_EMAIL_FROM is missing, malformed or a placeholder such as
 * sign-in@example.com. Resend only delivers (and signs with DKIM) mail from a domain verified in the account.
 */
export function usableResendSender(value: string | undefined) {
  const address = value?.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/)?.[1] ?? value?.trim();
  const domain = address?.match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i)?.[1];
  return address && domain && !PLACEHOLDER_SENDER_DOMAIN.test(domain) ? address : null;
}

let warnedPlaceholderSender = false;

function resendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const address = usableResendSender(process.env.AUTH_EMAIL_FROM);
  if (apiKey && process.env.AUTH_EMAIL_FROM && !address && !warnedPlaceholderSender) {
    warnedPlaceholderSender = true;
    console.warn("AUTH_EMAIL_FROM is not an address on a domain you own (for example it is still sign-in@example.com), so Resend is skipped.");
  }
  return apiKey && address ? { apiKey, sender: `${EMAIL_SENDER_NAME} <${address}>` } : null;
}

/** True when at least one delivery method (Gmail SMTP or Resend) is configured. */
export function emailDeliveryConfigured() {
  return Boolean(gmailConfig() || resendConfig());
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
      from: { name: EMAIL_SENDER_NAME, address: config.user },
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

/**
 * Sends via Resend first: mail from your own verified domain is SPF/DKIM-authenticated and lands in the inbox.
 * Gmail SMTP (a personal @gmail.com sender) is the fallback when Resend is not set up or fails, because inbox
 * providers often junk brand mail sent from a personal address. Returns false when nothing could deliver it.
 */
export async function sendTransactionalEmail(email: TransactionalEmail) {
  const resend = resendConfig();
  if (resend && await sendWithResend(resend, email)) return true;
  const gmail = gmailConfig();
  if (gmail) return sendWithGmail(gmail, email);
  return false;
}

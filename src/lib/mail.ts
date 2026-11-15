import "server-only";

import { env } from "@/lib/env";

/**
 * Email abstraction.
 *
 * Development uses the console driver so no credentials are needed to test
 * registration and password reset. Production uses SMTP (which covers Resend,
 * Postmark, Mailgun and a plain mail server) selected by configuration only.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

const consoleMailer: Mailer = {
  async send(mail) {
    console.info(
      [
        "",
        "───────────────────────────────────────────────",
        `[mail] to: ${mail.to}`,
        `[mail] subject: ${mail.subject}`,
        "",
        mail.text,
        "───────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
  },
};

function smtpMailer(): Mailer {
  // Imported lazily so the console driver has no transport dependency at all.
  let transportPromise: Promise<import("nodemailer").Transporter> | null = null;

  async function transport() {
    if (!transportPromise) {
      transportPromise = import("nodemailer").then(({ createTransport }) =>
        createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
        }),
      );
    }
    return transportPromise;
  }

  return {
    async send(mail) {
      const t = await transport();
      await t.sendMail({
        from: env.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (!mailer) mailer = env.MAIL_DRIVER === "smtp" ? smtpMailer() : consoleMailer;
  return mailer;
}

export async function sendMail(mail: Mail): Promise<void> {
  try {
    await getMailer().send(mail);
  } catch (error) {
    // Email failure must never break a registration or a password reset flow;
    // it is logged for operators instead.
    console.error("[mail] delivery failed", error instanceof Error ? error.message : error);
  }
}

export function verificationEmail(params: { to: string; username: string; token: string }) {
  const url = `${env.APP_URL}/verify?token=${encodeURIComponent(params.token)}`;
  return {
    to: params.to,
    subject: `Verify your ${env.APP_NAME} account`,
    text: [
      `Welcome to ${env.APP_NAME}, ${params.username}!`,
      "",
      "Confirm your email address to finish setting up your profile:",
      url,
      "",
      "This link expires in 24 hours. If you did not create this account, ignore this email.",
    ].join("\n"),
    html: layout(
      `Welcome, ${escapeHtml(params.username)}`,
      `Confirm your email address to activate your ${env.APP_NAME} profile.`,
      url,
      "Verify email",
      "This link expires in 24 hours. If you did not create this account, ignore this email.",
    ),
  };
}

export function passwordResetEmail(params: { to: string; username: string; token: string }) {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(params.token)}`;
  return {
    to: params.to,
    subject: `Reset your ${env.APP_NAME} password`,
    text: [
      `Hi ${params.username},`,
      "",
      "Use the link below to choose a new password:",
      url,
      "",
      "This link expires in 1 hour. If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: layout(
      "Reset your password",
      "Use the button below to choose a new password. If you did not request this, no action is needed.",
      url,
      "Reset password",
      "This link expires in 1 hour.",
    ),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function layout(title: string, body: string, url: string, cta: string, footnote: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#12161f;border:1px solid #232a36;border-radius:18px;padding:32px">
      <tr><td style="color:#f5f7fa;font-size:20px;font-weight:700;padding-bottom:12px">${escapeHtml(title)}</td></tr>
      <tr><td style="color:#a3adbf;font-size:15px;line-height:1.6;padding-bottom:24px">${escapeHtml(body)}</td></tr>
      <tr><td style="padding-bottom:24px">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:#1cb587;color:#04231b;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px">${escapeHtml(cta)}</a>
      </td></tr>
      <tr><td style="color:#65708a;font-size:12px;line-height:1.6">${escapeHtml(footnote)}<br/>${escapeHtml(url)}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

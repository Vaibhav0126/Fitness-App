import { Resend } from "resend";
import { env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let client: Resend | undefined;

/**
 * Sends a transactional email through Resend. Without RESEND_API_KEY (local dev, CI)
 * the message is logged instead, so auth flows can be tested offline.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM, NODE_ENV, ALLOW_CONSOLE_EMAIL } = env();
  if (!RESEND_API_KEY) {
    if (NODE_ENV === "production" && !ALLOW_CONSOLE_EMAIL) {
      throw new Error("RESEND_API_KEY is required in production (or set ALLOW_CONSOLE_EMAIL=true locally)");
    }
    console.info(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }
  client ??= new Resend(RESEND_API_KEY);
  const { error } = await client.emails.send({ from: EMAIL_FROM, ...msg });
  if (error) throw new Error(`Resend failed: ${error.name}: ${error.message}`);
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:24px;color:#111">
<h1 style="font-size:20px;margin:0 0 12px">${escape(title)}</h1>
<p style="line-height:1.5">${escape(body)}</p>
<p><a href="${escape(cta.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escape(cta.label)}</a></p>
<p style="color:#666;font-size:12px">If you didn't request this, you can ignore this email.</p>
</div></body></html>`;
}

export function verifyEmailTemplate(url: string) {
  return {
    subject: "Verify your email for Train",
    html: layout("Confirm your email", "Click the button below to verify your email address.", {
      label: "Verify email",
      url,
    }),
    text: `Verify your email for Train: ${url}`,
  };
}

export function resetPasswordTemplate(url: string) {
  return {
    subject: "Reset your Train password",
    html: layout("Reset your password", "This link expires in one hour.", { label: "Reset password", url }),
    text: `Reset your Train password (the link expires in 1 hour): ${url}`,
  };
}

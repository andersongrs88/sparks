import nodemailer from "nodemailer";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export function getSmtpTransport() {
  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure: false, // TLS via STARTTLS (porta 587)
    auth: { user, pass },
  });
}

export function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER;
}

export function appUrl() {
  return process.env.APP_URL || "";
}

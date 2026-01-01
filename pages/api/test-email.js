import { getSmtpTransport, getFromAddress } from "../../lib/emailSmtp";

export default async function handler(req, res) {
  const token = req.headers["x-cron-token"] || req.query.token;
  if (process.env.CRON_TOKEN && token !== process.env.CRON_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const to = req.query.to;
  if (!to) return res.status(400).json({ ok: false, error: "Informe ?to=seuemail" });

  try {
    const transporter = getSmtpTransport();
    const from = getFromAddress();

    await transporter.sendMail({
      from,
      to,
      subject: "Sparks — teste de e-mail SMTP",
      html: `<p>Se você recebeu isto, o SMTP está funcionando.</p>`,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro" });
  }
}

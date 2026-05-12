let nodemailer;
try { nodemailer = require('nodemailer'); } catch {}

async function sendPasswordReset(toEmail, resetLink) {
  if (!nodemailer || !process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'ResidentFlow <noreply@residentflow.app>',
    to: toEmail,
    subject: 'Reset your ResidentFlow password',
    text: `Reset your ResidentFlow password by visiting this link:\n\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `<p>Click the link below to reset your ResidentFlow password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
  });
  return true;
}

module.exports = { sendPasswordReset };

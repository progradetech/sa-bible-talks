import nodemailer from 'nodemailer';

interface SendMessage {
  to: string;
  replyTo?: string;
  bcc?: string;
  subject: string;
  body: string;
}

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

function getTransporter(): Promise<nodemailer.Transporter> {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.GMAIL_SMTP_USER!,
          pass: process.env.GMAIL_SMTP_APP_PASSWORD!,
        },
      }),
    );
  }
  return transporterPromise;
}

export async function send(msg: SendMessage): Promise<void> {
  const from = `SA Bible Talks <${process.env.GMAIL_SMTP_USER}>`;
  const transporter = await getTransporter();

  await transporter.sendMail({
    from,
    to: msg.to,
    replyTo: msg.replyTo,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.body,
  });
}

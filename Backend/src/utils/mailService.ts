import nodemailer from 'nodemailer';

const buildTransporter = (portOverride?: number) => {
  const host = process.env.SMTP_HOST;
  const port = Number(portOverride ?? process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    requireTLS: port === 587,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
};

const isRetryableConnectionError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typedError = error as { code?: string; command?: string };
  return (
    typedError.code === 'ETIMEDOUT' ||
    typedError.code === 'ECONNREFUSED' ||
    typedError.code === 'EHOSTUNREACH' ||
    typedError.code === 'ENETUNREACH' ||
    typedError.command === 'CONN'
  );
};

export const sendOtpEmail = async (toEmail: string, otpCode: string) => {
  const transporter = buildTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP DEV MODE] ${toEmail}: ${otpCode}`);
      return;
    }

    throw new Error('SMTP is not configured for production');
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  const mailPayload = {
    from,
    to: toEmail,
    subject: 'Ma OTP xac thuc tai khoan',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <h2>Xác thực tài khoản</h2>
        <p>Mã OTP của bạn là:</p>
        <p style="font-size: 28px; letter-spacing: 6px; font-weight: bold; color: #1f5ca9;">${otpCode}</p>
        <p>Mã có hiệu lực trong <strong>5 phut</strong>.</p>
        <p>Vui lòng bỏ qua email này nếu có nhầm lẫn.</p>
      </div>
    `,
  };

  const primaryPort = Number(process.env.SMTP_PORT || 587);
  const portsToTry = Array.from(new Set([primaryPort, primaryPort === 587 ? 465 : 587]));

  let lastError: unknown;
  for (const port of portsToTry) {
    try {
      const currentTransporter = port === primaryPort ? transporter : buildTransporter(port);
      if (!currentTransporter) {
        break;
      }

      await currentTransporter.sendMail(mailPayload);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
};

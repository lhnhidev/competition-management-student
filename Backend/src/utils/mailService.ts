import nodemailer from 'nodemailer';

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
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

export const sendOtpEmail = async (toEmail: string, otpCode: string) => {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP DEV MODE] ${toEmail}: ${otpCode}`);
      return;
    }

    throw new Error('SMTP is not configured for production');
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
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
  });
};

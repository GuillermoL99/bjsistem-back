import nodemailer from "nodemailer";
import QRCode from "qrcode";

// Configura el transporter para Gmail (usando `.env`)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Envía mail con QR como imagen adjunta y referencia CID.
 * @param {string} to - Email destino
 * @param {string} subject - Asunto del correo
 * @param {string} qrData - El contenido para el QR
 * @param {object} ticketData - Info de la compra 
 */
export async function sendTicketQR(to, subject, qrData, ticketData) {
  // 1. Generar QR como buffer (imagen PNG)
  const qrBuffer = await QRCode.toBuffer(qrData);

  // 2. HTML del mail: referencia la imagen adjunta con src="cid:qrimage"
  const html = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f7f7fb; padding: 32px;">
    <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 8px #0001; padding: 32px 28px;">
      <div style="text-align:center;">
        <h1 style="color: #1864ab; margin-bottom: 12px;">¡Tu entrada está lista!</h1>
        <p style="font-size:18px; margin-bottom: 24px">
          Gracias por tu compra.<br>
          Presentá este QR en la puerta del evento.<br>
        </p>
        <img 
          src="cid:qrimage" 
          alt="QR de tu entrada"
          width="320" 
          height="320"
          style="display:block; margin: 0 auto 20px auto; border-radius:16px; border:4px solid #eee; box-shadow:0 2px 6px #0003;" 
        />
        ${ticketData.ticketCode ? `
        <div style="margin: 0 auto 20px; display:inline-block; background:#f0f4ff; border:2px dashed #1864ab; border-radius:12px; padding:14px 28px;">
          <div style="font-size:13px; color:#555; margin-bottom:6px; letter-spacing:.05em; text-transform:uppercase;">Código de respaldo</div>
          <div style="font-size:36px; font-weight:900; letter-spacing:.25em; color:#1864ab;">${ticketData.ticketCode}</div>
          <div style="font-size:12px; color:#888; margin-top:6px;">Usalo si el QR no puede escanearse</div>
        </div>` : ""}
      </div>
      <div style="margin: 24px 0 0 0; font-size:16px;">
        <b>Evento:</b> <span style="color:#1864ab">${ticketData.title}</span><br>
        <b>Nombre:</b> ${ticketData.nombre}<br>
        <b>DNI:</b> ${ticketData.dni}
      </div>
      <div style="margin-top: 32px; font-size:14px; color:#888; text-align:center;">
        ¿Tenés dudas? Respondé a este correo.<br>
        <span style="font-size:11px">No compartas tu QR con otros.</span>
      </div>
    </div>
  </div>
`;

  // 3. Enviar mail con adjunto
  await transporter.sendMail({
    from: `"Entradas" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: "qrcode.png",
        content: qrBuffer,
        cid: "qrimage", // Debe coincidir con src="cid:qrimage"
      },
    ],
  });
}
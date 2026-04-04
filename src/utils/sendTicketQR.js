/**
 * Envía mail de confirmación con QR y código de respaldo via Brevo HTTP API.
 * @param {string} to - Email destino
 * @param {string} subject - Asunto del correo
 * @param {string} qrData - El contenido para el QR (orderId)
 * @param {object} ticketData - Info de la compra
 */
import QRCode from "qrcode";

export async function sendTicketQR(to, subject, qrData, ticketData) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("[mail] BREVO_API_KEY no configurada, no se envía email");
    return;
  }

  // Generar QR como base64 (sin prefijo data:image/png;base64,)
  let qrBase64 = "";
  try {
    const dataUrl = await QRCode.toDataURL(qrData, { width: 320, margin: 2 });
    qrBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  } catch (e) {
    console.error("[mail] Error generando QR:", e);
  }

  const qrHtml = qrBase64
    ? `<div style="margin: 20px 0; text-align:center;">
        <p style="font-size:14px; color:#555; margin-bottom:8px;">Presentá este QR en la puerta del evento:</p>
        <img src="cid:qr-entrada" alt="QR de tu entrada" style="width:240px; height:240px; border-radius:12px; border:3px solid #eee;" />
      </div>`
    : `<p style="text-align:center; color:#888;">Descargá tu QR desde la página de confirmación.</p>`;

  const html = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f7f7fb; padding: 32px;">
    <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 8px #0001; padding: 32px 28px;">
      <div style="text-align:center;">
        <h1 style="color: #1864ab; margin-bottom: 12px;">¡Gracias por tu compra!</h1>
        <p style="font-size:18px; margin-bottom: 24px">
          Tu entrada fue confirmada.
        </p>
        ${qrHtml}
        ${ticketData.ticketCode ? `
        <div style="margin: 20px auto; display:inline-block; background:#f0f4ff; border:2px dashed #1864ab; border-radius:12px; padding:14px 28px;">
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
        <span style="font-size:11px">No compartas tu QR ni tu código con otros.</span>
      </div>
    </div>
  </div>
`;

  const senderEmail = process.env.BREVO_SENDER || process.env.SMTP_USER;

  const emailPayload = {
    sender: { name: "Entradas", email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  // Adjuntar QR como imagen inline (CID) si se generó
  if (qrBase64) {
    emailPayload.attachment = [
      {
        content: qrBase64,
        name: "qr-entrada.png",
        contentId: "qr-entrada",
      },
    ];
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error ${res.status}: ${err}`);
  }

  console.log("[mail] Email enviado via Brevo a:", to);
}
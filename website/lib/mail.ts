import nodemailer,{type Transporter} from 'nodemailer';

/* Outgoing email through Hostinger (or any SMTP server):
   SMTP_HOST=smtp.hostinger.com SMTP_PORT=465 SMTP_USER=no-reply@veyraeditor.com SMTP_PASSWORD=… MAIL_FROM="Veyra <no-reply@veyraeditor.com>" */

export const mailConfigured=()=>!!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD);

let transport:Transporter|null=null;
function transporter(){
  if(transport) return transport;
  const port=Number(process.env.SMTP_PORT)||465;
  transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}});
  return transport;
}

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function sendPasswordReset(to:string,name:string,link:string){
  await transporter().sendMail({
    from:process.env.MAIL_FROM||process.env.SMTP_USER,
    to,
    subject:'Reset your Veyra password',
    text:`Hi ${name},\n\nSomeone asked to reset the password for your Veyra account. If that was you, open this link within one hour:\n\n${link}\n\nIf you didn't ask, you can ignore this email; your password stays the same.\n\n— Veyra Studio`,
    html:`<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#1c2430">
      <h2 style="margin:0 0 12px">Reset your Veyra password</h2>
      <p>Hi ${escape(name)},</p>
      <p>Someone asked to reset the password for your Veyra account. If that was you, choose a new password within one hour:</p>
      <p><a href="${escape(link)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#68f4d1;color:#06100d;font-weight:700;text-decoration:none">Choose a new password</a></p>
      <p style="color:#5b6775;font-size:13px">If you didn't ask, ignore this email; your password stays the same.</p>
    </div>`,
  });
}

/* ---------- FlightCoders project enquiries ---------- */
type LeadMail = { name: string; email: string; company: string; service: string; budget: string; timeline: string; message: string; source: string };
/** Where enquiries go: LEADS_EMAIL (one address, or several separated by commas). Unset = enquiries are only stored. */
export const leadsInbox = () => (process.env.LEADS_EMAIL || "").split(",").map(a => a.trim()).filter(Boolean);

/** Tells the team about a new enquiry. Reply goes straight to the person who asked. */
export async function sendLeadNotification(lead: LeadMail, id: number) {
  const rows: [string, string][] = [["Name", lead.name], ["Email", lead.email], ["Company", lead.company || "—"], ["Wants", lead.service], ["Budget", lead.budget || "—"], ["Timeline", lead.timeline || "—"], ["Came from", lead.source || "—"]];
  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: leadsInbox(),
    replyTo: `"${lead.name.replace(/"/g, "")}" <${lead.email}>`,
    subject: `New project enquiry #${id}: ${lead.service}${lead.company ? ` (${lead.company})` : ""}`,
    text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${lead.message}\n\nReply to this email to answer ${lead.name}.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#1c2430">
      <h2 style="margin:0 0 14px">New project enquiry #${id}</h2>
      <table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#5b6775">${k}</td><td style="padding:4px 0"><b>${escape(v)}</b></td></tr>`).join("")}</table>
      <p style="white-space:pre-wrap;background:#f3f6f8;border-radius:10px;padding:14px;margin:16px 0">${escape(lead.message)}</p>
      <p style="color:#5b6775;font-size:13px">Reply to this email to answer ${escape(lead.name)} directly.</p>
    </div>`,
  });
}

/** Lets the person know their message arrived. */
export async function sendLeadConfirmation(lead: LeadMail) {
  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: lead.email,
    replyTo: leadsInbox()[0] || undefined,
    subject: "We got your message, FlightCoders",
    text: `Hi ${lead.name},\n\nThanks for telling us about your project (${lead.service}). A real person from FlightCoders will reply within one business day.\n\nYour message:\n${lead.message}\n\nFlightCoders, the team behind Veyra Studio\nhttps://veyraeditor.com/flightcoders`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#1c2430">
      <h2 style="margin:0 0 12px">Thanks, ${escape(lead.name)}!</h2>
      <p>We got your message about <b>${escape(lead.service)}</b>. A real person from FlightCoders will reply within one business day.</p>
      <p style="white-space:pre-wrap;background:#f3f6f8;border-radius:10px;padding:14px;color:#3b4652">${escape(lead.message)}</p>
      <p style="color:#5b6775;font-size:13px">FlightCoders, the team behind <a href="https://veyraeditor.com">Veyra Studio</a></p>
    </div>`,
  });
}

/* ---------- Diagnostics for /api/health: log in to the SMTP server without sending anything ---------- */
const MAIL_HINTS:Record<string,string>={
  EAUTH:'The mail server rejected SMTP_USER / SMTP_PASSWORD. Use the full address (no-reply@veyraeditor.com) and that mailbox\'s password (hPanel → Emails), then redeploy.',
  ECONNECTION:'Could not connect to SMTP_HOST:SMTP_PORT. Use smtp.hostinger.com and port 465.',
  ETIMEDOUT:'The mail server did not answer in time. Check SMTP_HOST (smtp.hostinger.com) and SMTP_PORT (465).',
  ESOCKET:'The secure connection failed. With port 465 use smtp.hostinger.com; with port 587 the connection upgrades automatically.',
  EDNS:'SMTP_HOST is not a known host name. Use smtp.hostinger.com.',
};
export async function checkMail(){
  if(!mailConfigured()) return {configured:false,ok:false,code:'NOT_CONFIGURED',hint:'Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD, then redeploy.'};
  try{
    await transporter().verify();
    return {configured:true,ok:true,code:'OK',hint:'Signed in to the mail server; password-reset emails can be sent.'};
  }catch(error){
    transport=null; // retry with fresh settings next time
    const e=error as {code?:string;responseCode?:number;response?:string};
    const code=e.code||(e.responseCode?'SMTP_'+e.responseCode:'UNKNOWN');
    console.error('[veyra] mail check failed:',code,error);
    return {configured:true,ok:false,code,hint:MAIL_HINTS[code]||'The mail server refused the connection.',detail:String(e.response||'').slice(0,160)};
  }
}

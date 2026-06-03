const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');

const SHOP_EMAIL = process.env.MML_LEAD_EMAIL || 'motorcyclemasterlink@gmail.com';
const SHOP_SMS = process.env.MML_SHOP_SMS || '+17543337761';
const CRM_PATH = process.env.MML_CRM_PATH || (process.env.HOME ? path.join(process.env.HOME, '.openclaw', 'workspace', 'data', 'customers.json') : path.join(process.cwd(), 'data', 'customers.json'));
const APPT_LOG_PATH = process.env.MML_APPOINTMENT_LOG_PATH || (process.env.HOME ? path.join(process.env.HOME, '.openclaw', 'workspace', 'memory', 'motorcycle-masterlink-appointments.jsonl') : path.join(process.cwd(), 'memory', 'motorcycle-masterlink-appointments.jsonl'));
const ENABLE_TWILIO_ALERTS = String(process.env.MML_ENABLE_TWILIO_ALERTS || '').toLowerCase() === 'true';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function normalizePhone(value = '') {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

function safeTrim(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function buildLead(payload) {
  const name = safeTrim(payload.name || payload.customerName || payload['Customer Name'], 120) || 'Website Lead';
  const phone = normalizePhone(payload.phone || payload.Phone);
  const email = safeTrim(payload.email || payload.Email, 200);
  const year = safeTrim(payload.year || payload.Year, 20);
  const makeModel = safeTrim(payload.makeModel || payload['Make Model'], 160);
  const bike = [year, makeModel].filter(Boolean).join(' ').trim();
  const service = safeTrim(payload.service || payload['Service Needed'], 160);
  const urgency = safeTrim(payload.urgency || payload.Urgency, 80);
  const location = safeTrim(payload.location || payload.Location, 200);
  const issue = safeTrim(payload.issue || payload.Issue, 2000);
  const preferredTime = safeTrim(payload.preferredTime || payload['Preferred Time'], 200);
  const source = safeTrim(payload.source, 80) || 'website_form';
  const created = new Date().toISOString().slice(0, 10);

  const notes = [
    `Website appointment request received ${new Date().toISOString()}`,
    service && `Service: ${service}`,
    urgency && `Urgency: ${urgency}`,
    location && `Location: ${location}`,
    preferredTime && `Preferred time: ${preferredTime}`,
    issue && `Issue: ${issue}`,
  ].filter(Boolean).join('\n');

  return { name, phone, email, bike, service, urgency, location, issue, preferredTime, source, created, notes };
}

function upsertLocalCrm(lead) {
  const dbPath = CRM_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { customers: [] };
  const customers = db.customers || (db.customers = []);
  const phoneKey = (lead.phone || '').replace(/\s/g, '');
  const nameKey = lead.name.toLowerCase();
  let existing = customers.find((c) => phoneKey && String(c.phone || '').replace(/\s/g, '') === phoneKey);
  if (!existing) existing = customers.find((c) => c.name && c.name.toLowerCase() === nameKey);

  if (existing) {
    if (lead.email && !existing.email) existing.email = lead.email;
    if (lead.phone && !existing.phone) existing.phone = lead.phone;
    if (lead.bike && !existing.bike) existing.bike = lead.bike;
    existing.notes = [existing.notes, lead.notes].filter(Boolean).join('\n\n');
    existing.status = existing.status || 'lead';
  } else {
    customers.push({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      bike: lead.bike,
      notes: lead.notes,
      created: lead.created,
      lastService: '',
      status: 'lead',
      source: lead.source,
    });
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  return { created: !existing, customer: existing || customers[customers.length - 1] };
}

function appendAppointmentLog(lead, crmResult) {
  const logPath = APPT_LOG_PATH;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const row = {
    kind: 'website_appointment_request',
    ts: Math.floor(Date.now() / 1000),
    status: 'new_lead',
    crm_created: crmResult.created,
    fields: lead,
  };
  fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`);
}

function sendTwilioSms(body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || SHOP_SMS;
  const to = process.env.MML_LEAD_ALERT_TO || SHOP_SMS;
  if (!ENABLE_TWILIO_ALERTS) return Promise.resolve({ skipped: true, reason: 'twilio_alerts_disabled' });
  if (!accountSid || !authToken || !from || !to) return Promise.resolve({ skipped: true, reason: 'missing_twilio_env' });
  if (from.replace(/\D/g, '') === to.replace(/\D/g, '')) return Promise.resolve({ skipped: true, reason: 'to_from_same_number' });

  const postData = new URLSearchParams({ To: to, From: from, Body: body }).toString();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const options = {
    hostname: 'api.twilio.com',
    path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(postData),
    },
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: raw.slice(0, 500) }));
    });
    req.on('error', (error) => resolve({ error: error.message }));
    req.write(postData);
    req.end();
  });
}

function emailFallbackLink(lead) {
  const subject = encodeURIComponent('Motorcycle Master Link appointment request');
  const body = encodeURIComponent([
    `Customer Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    `Bike: ${lead.bike}`,
    `Service Needed: ${lead.service}`,
    `Urgency: ${lead.urgency}`,
    `Location: ${lead.location}`,
    `Preferred Time: ${lead.preferredTime}`,
    `Issue: ${lead.issue}`,
  ].join('\n'));
  return `mailto:${SHOP_EMAIL}?subject=${subject}&body=${body}`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const lead = buildLead(payload);
    if (!lead.name || !lead.phone || !lead.issue) {
      return json(400, { ok: false, error: 'missing_required_fields', required: ['name', 'phone', 'issue'] });
    }

    let crmResult = { created: false, customer: null };
    let localCrm = true;
    try {
      crmResult = upsertLocalCrm(lead);
      appendAppointmentLog(lead, crmResult);
    } catch (error) {
      localCrm = false;
      console.error('Local CRM write skipped/failed:', error);
    }

    const sms = await sendTwilioSms([
      `🏍️ Website lead: ${lead.name}`,
      `Phone: ${lead.phone}`,
      lead.bike && `Bike: ${lead.bike}`,
      lead.service && `Service: ${lead.service}`,
      lead.urgency && `Urgency: ${lead.urgency}`,
      lead.preferredTime && `Preferred: ${lead.preferredTime}`,
      lead.issue && `Issue: ${lead.issue.slice(0, 240)}`,
    ].filter(Boolean).join('\n'));

    return json(200, {
      ok: true,
      routed_to_email: SHOP_EMAIL,
      crm_saved: localCrm,
      crm_created: crmResult.created,
      sms_alert: sms,
      email_fallback: emailFallbackLink(lead),
    });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: 'server_error' });
  }
};

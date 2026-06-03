# Motorcycle MasterLink Website

Static website prepared for free Netlify hosting.

## Files
- `index.html` — main website
- `thank-you.html` — form success page
- `assets/logo.jpg` — logo
- `netlify.toml` — Netlify publish/security headers

## Form
The appointment form has two layers:

1. Primary route: `/.netlify/functions/appointment-request`
   - validates website leads
   - routes the request toward `motorcyclemasterlink@gmail.com`
   - writes/updates the Motorcycle Master Link CRM when deployed where `data/customers.json` is writable
   - can send a Twilio SMS alert when Twilio env vars are configured

2. Fallback route: email app opens a `mailto:motorcyclemasterlink@gmail.com` message if the function is unavailable.

Netlify static form metadata is still present:
- form name: `appointment-request`
- spam honeypot: `bot-field`
- success page: `/thank-you.html`

Recommended Netlify env vars:
- `MML_LEAD_EMAIL=motorcyclemasterlink@gmail.com`
- `MML_SHOP_SMS=+17543337761`
- `MML_LEAD_ALERT_TO=+17543337761`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

After deploy, also enable Netlify email notifications:
Site → Forms → appointment-request → Form notifications → Email notification → `motorcyclemasterlink@gmail.com`.

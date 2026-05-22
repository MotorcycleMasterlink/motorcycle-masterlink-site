# Motorcycle MasterLink Website

Static website prepared for free Netlify hosting.

## Files
- `index.html` — main website
- `thank-you.html` — form success page
- `assets/logo.jpg` — logo
- `netlify.toml` — Netlify publish/security headers

## Form
The appointment form uses Netlify Forms:
- form name: `appointment-request`
- spam honeypot: `bot-field`
- success page: `/thank-you.html`

After deploy, enable email notifications in Netlify:
Site → Forms → appointment-request → Form notifications → Email notification.

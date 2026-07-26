// Cloudflare Pages Function: POST /api/demo
//
// Backs the demo form with a real endpoint so submission works with JavaScript
// disabled (native form POST → 303 redirect → static thank-you page).
//
// TODO(owner): wire the real handler — forward the lead to the PGManage leads
// API (POST /api/v1/leads/website) or email stay@theloopliving.in. Right now it
// validates, logs, and redirects. No secrets live in this file.

interface Env {}

const isIndianMobile = (s: string) => /^[6-9]\d{9}$/.test(s);

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const origin = new URL(request.url).origin;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.redirect(`${origin}/demo?error=1`, 303);
  }

  const get = (k: string) => (form.get(k) ?? '').toString().trim();

  // Honeypot — a bot filled the hidden field. Pretend success, drop it.
  if (get('company')) {
    return Response.redirect(`${origin}/demo/thanks`, 303);
  }

  const lead = {
    name: get('name'),
    phone: get('phone'),
    city: get('city'),
    beds: get('beds'),
    properties: get('properties'),
    current_tool: get('current_tool'),
  };

  const valid =
    lead.name.length > 1 &&
    isIndianMobile(lead.phone) &&
    lead.city.length > 1 &&
    Number(lead.beds) >= 1 &&
    Number(lead.properties) >= 1 &&
    lead.current_tool.length > 0;

  if (!valid) {
    return Response.redirect(`${origin}/demo?error=1`, 303);
  }

  // TODO(owner): replace this log with the real lead sink.
  console.log('[demo-lead]', JSON.stringify(lead));

  return Response.redirect(`${origin}/demo/thanks`, 303);
};

// A GET to /api/demo just bounces to the form.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const origin = new URL(context.request.url).origin;
  return Response.redirect(`${origin}/demo`, 303);
};

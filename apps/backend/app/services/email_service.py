"""Tiny SMTP-based email sender. Falls back to stdout logging when SMTP_HOST is unset.

Production wiring (Gmail App Password):
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=mastanbasha11@gmail.com
  SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx       (16-char app password from myaccount.google.com)
  SMTP_FROM=mastanbasha11@gmail.com
  ADMIN_NOTIFICATION_EMAIL=mastanbasha11@gmail.com
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable

from app.core.config import settings

log = logging.getLogger(__name__)


def send_email(
    to: str | Iterable[str],
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Send an email; returns True on success, False otherwise.

    Failures are logged but never raised — email is non-critical for the request,
    we never want signup to fail because SMTP is down.
    """
    recipients = [to] if isinstance(to, str) else list(to)

    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        log.warning(
            "[email] SMTP not configured — would have sent:\n"
            "  to=%s\n  subject=%s\n  body=%s",
            recipients,
            subject,
            body_text[:300],
        )
        return False

    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        log.info("[email] sent to=%s subject=%r", recipients, subject)
        return True
    except Exception as e:  # noqa: BLE001 — best-effort
        log.exception("[email] send failed to=%s: %s", recipients, e)
        return False


def send_signup_approval_email(
    *,
    org_id: str,
    org_name: str,
    owner_name: str,
    owner_email: str,
    owner_phone: str,
    city: str,
    approve_url: str,
    reject_url: str,
) -> bool:
    """Notify the platform admin that a new org needs approval."""
    if not settings.ADMIN_NOTIFICATION_EMAIL:
        log.warning("[email] ADMIN_NOTIFICATION_EMAIL not set — skipping signup notification")
        return False

    subject = f"[PGManage] New signup pending approval: {org_name}"

    body_text = f"""
A new organisation has signed up on PGManage and is waiting for your approval.

  Name:    {owner_name}
  Email:   {owner_email}
  Phone:   {owner_phone}
  PG name: {org_name}
  City:    {city}
  Org ID:  {org_id}

Approve:  {approve_url}
Reject:   {reject_url}

These links expire in 7 days. Until you approve, the user will see a
"Pending approval" screen and cannot log in to the app.
""".strip()

    body_html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             color:#0F172A;background:#f8fafc;padding:24px;">
  <div style="max-width:560px;margin:auto;background:white;border-radius:12px;
              padding:32px;border:1px solid #e2e8f0;">
    <h2 style="margin:0 0 4px 0;color:#0F172A;">New signup pending approval</h2>
    <p style="color:#64748b;margin:0 0 20px 0;">A new PG owner is waiting for your green-light.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;color:#64748b;width:90px;">Name</td><td style="padding:6px 0;font-weight:500;">{owner_name}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;font-weight:500;">{owner_email}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;font-weight:500;">{owner_phone}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">PG name</td><td style="padding:6px 0;font-weight:500;">{org_name}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">City</td><td style="padding:6px 0;font-weight:500;">{city}</td></tr>
    </table>

    <div style="display:flex;gap:12px;margin-top:8px;">
      <a href="{approve_url}" style="background:#0D9488;color:white;text-decoration:none;
         padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">
        Approve
      </a>
      <a href="{reject_url}" style="background:#f1f5f9;color:#0F172A;text-decoration:none;
         padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">
        Reject
      </a>
    </div>

    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
      Links expire in 7 days. Org ID: {org_id}
    </p>
  </div>
</body>
</html>
""".strip()

    return send_email(
        to=settings.ADMIN_NOTIFICATION_EMAIL,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )


def send_password_reset_email(
    *,
    to_email: str,
    user_name: str,
    reset_url: str,
    expires_in_hours: int = 1,
) -> bool:
    subject = "Reset your PGManage password"
    body_text = f"""
Hi {user_name},

We received a request to reset your PGManage password. Click the link below
to choose a new one. This link expires in {expires_in_hours} hour(s).

  {reset_url}

If you didn't request this, you can safely ignore this email — your password
will stay unchanged.

— PGManage
""".strip()
    body_html = f"""
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                   color:#0F172A;background:#f8fafc;padding:24px;">
  <div style="max-width:520px;margin:auto;background:white;border-radius:12px;
              padding:32px;border:1px solid #e2e8f0;">
    <h2 style="margin:0 0 12px 0;">Reset your password</h2>
    <p style="color:#475569;margin:0 0 20px 0;">
      Hi {user_name}, we got a request to reset your PGManage password. Click the
      button below to choose a new one.
    </p>
    <p style="margin:24px 0;">
      <a href="{reset_url}" style="background:#0D9488;color:white;text-decoration:none;
         padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">
        Set a new password
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
      This link expires in {expires_in_hours} hour(s).<br>
      Didn't request this? You can ignore this email — your password stays unchanged.
    </p>
  </div>
</body></html>
""".strip()
    return send_email(to=to_email, subject=subject, body_text=body_text, body_html=body_html)


def send_website_lead_email(
    *,
    to_email: str,
    org_name: str,
    property_name: str | None,
    lead_name: str,
    lead_email: str | None,
    lead_phone: str,
    room_type: str | None,
    move_in_date: str | None,
    message: str | None,
    leads_url: str,
) -> bool:
    """Notify the PG owner of a new booking enquiry from their website form."""
    subject = f"New booking enquiry from {lead_name} — {org_name}"

    # Plain-text fallback
    lines = [
        f"New booking enquiry on your website ({org_name}).",
        "",
        f"  Name:        {lead_name}",
        f"  Phone:       {lead_phone}",
    ]
    if lead_email:
        lines.append(f"  Email:       {lead_email}")
    if room_type:
        lines.append(f"  Room type:   {room_type}")
    if move_in_date:
        lines.append(f"  Move-in:     {move_in_date}")
    if property_name:
        lines.append(f"  Property:    {property_name}")
    if message:
        lines += ["", "  Message:", f"  {message}"]
    lines += ["", f"View in PGManage: {leads_url}"]
    body_text = "\n".join(lines)

    def _row(label: str, value: str, *, link: str | None = None) -> str:
        cell = (
            f'<a href="{link}" style="color:#0D9488;text-decoration:none;">{value}</a>'
            if link
            else value
        )
        return (
            '<tr>'
            '<td style="padding:10px 0;color:#64748b;font-size:13px;width:120px;'
            'vertical-align:top;border-bottom:1px solid #f1f5f9;">' + label + '</td>'
            '<td style="padding:10px 0;font-weight:500;font-size:14px;color:#0F172A;'
            'border-bottom:1px solid #f1f5f9;">' + cell + '</td>'
            '</tr>'
        )

    rows = _row("Name", lead_name)
    rows += _row("Phone", lead_phone, link=f"tel:{lead_phone}")
    if lead_email:
        rows += _row("Email", lead_email, link=f"mailto:{lead_email}")
    if room_type:
        rows += _row("Room type", room_type)
    if move_in_date:
        rows += _row("Move-in date", move_in_date)
    if property_name:
        rows += _row("Property", property_name)

    message_block = (
        f'''
      <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:10px;
                  border:1px solid #e2e8f0;">
        <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;text-transform:uppercase;
                  letter-spacing:.04em;">Message</p>
        <p style="margin:0;color:#0F172A;font-size:14px;line-height:1.5;">{message}</p>
      </div>'''
        if message
        else ""
    )

    body_html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
             background:#f1f5f9;padding:24px;">
  <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;
              border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.06);">

    <!-- Header -->
    <div style="background:#0F172A;padding:28px 32px;">
      <p style="margin:0;color:#5eead4;font-size:12px;font-weight:600;letter-spacing:.08em;
                text-transform:uppercase;">New booking enquiry</p>
      <h1 style="margin:6px 0 0 0;color:#ffffff;font-size:22px;font-weight:700;">{lead_name}</h1>
      <p style="margin:6px 0 0 0;color:#94a3b8;font-size:13px;">
        via your website booking form &middot; {org_name}
      </p>
    </div>

    <!-- Details -->
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">{rows}</table>
      {message_block}

      <a href="{leads_url}"
         style="display:inline-block;margin-top:24px;background:#0D9488;color:#ffffff;
                text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;
                font-size:14px;">
        View in PGManage &rarr;
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">
        You're receiving this because new website leads are routed to this address.
        Change it under Settings &rarr; Website Integration in PGManage.
      </p>
    </div>
  </div>
</body>
</html>
""".strip()

    return send_email(to=to_email, subject=subject, body_text=body_text, body_html=body_html)


def send_signup_approved_email(*, owner_email: str, owner_name: str, login_url: str) -> bool:
    subject = "Your PGManage account is approved"
    body_text = f"""
Hi {owner_name},

Your PGManage account has been approved. You can now log in:
  {login_url}

— PGManage
""".strip()
    body_html = f"""
<div style="font-family:sans-serif;max-width:520px;padding:24px;">
  <h2>Welcome to PGManage 👋</h2>
  <p>Hi {owner_name}, your account has been approved. Click below to log in:</p>
  <p><a href="{login_url}" style="background:#0D9488;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Open PGManage</a></p>
</div>
""".strip()
    return send_email(to=owner_email, subject=subject, body_text=body_text, body_html=body_html)

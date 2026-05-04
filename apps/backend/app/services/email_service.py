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

import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="12 June 2026">
      <p>
        This Privacy Policy explains how <strong>LOOP Colving PG</strong> ("we", "us", "our"),
        operator of the PGManage application and the website at{' '}
        <a href="https://pgmanage.in">pgmanage.in</a> ("Service"), collects, uses, and protects
        information. PGManage is a property-management tool for Paying Guest (PG) and hostel
        operators in India. By using the Service you agree to this Policy.
      </p>

      <h2>1. Who we are</h2>
      <p>
        PGManage is operated by LOOP Colving PG. For any privacy question or request you can reach
        us at <a href="mailto:thotaadityasaikumar@outlook.com">thotaadityasaikumar@outlook.com</a>.
      </p>

      <h2>2. Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; business data</strong> — owner/staff name, email, phone number,
          property details, rooms, beds, and team roles.
        </li>
        <li>
          <strong>Resident (tenant) data entered by operators</strong> — name, phone number, stay
          dates, rent and payment records, and optional identity documents (e.g. Aadhaar) uploaded
          by the operator for KYC.
        </li>
        <li>
          <strong>Financial records</strong> — rent, advances, refunds, expenses, and payment
          metadata. We do not store card numbers or bank credentials.
        </li>
        <li>
          <strong>Communications</strong> — messages we send to residents (e.g. rent reminders,
          receipts) and inbound replies received over WhatsApp.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, device/browser information, and log data
          used for security and to operate the Service.
        </li>
      </ul>

      <h2>3. WhatsApp and Meta</h2>
      <p>
        PGManage uses the <strong>WhatsApp Business Platform (Meta Cloud API)</strong> to let PG
        operators send transactional messages — such as rent reminders, payment receipts, and
        booking confirmations — to their own residents, and to receive residents' replies. We use
        this only to deliver messages a resident would reasonably expect from their PG operator.
      </p>
      <ul>
        <li>
          We send messages using pre-approved message templates. We do not send marketing or
          promotional WhatsApp messages without consent.
        </li>
        <li>
          When a resident replies, the message content and sender phone number are processed to
          route the reply to the correct operator and (where relevant) log it as a complaint or
          query.
        </li>
        <li>
          Data shared with Meta is governed by Meta's own{' '}
          <a href="https://www.whatsapp.com/legal/business-policy/">
            WhatsApp Business Messaging Policy
          </a>{' '}
          and <a href="https://www.facebook.com/privacy/policy/">Meta Privacy Policy</a>. A resident
          can opt out at any time by replying STOP or by asking their PG operator to remove their
          number.
        </li>
      </ul>

      <h2>4. How we use information</h2>
      <ul>
        <li>To provide and operate the property-management Service for operators and their staff.</li>
        <li>
          To send transactional notifications (rent due, receipts, move-out alerts, booking
          confirmations) via WhatsApp, email, and in-app channels.
        </li>
        <li>To process and record payments, expenses, and ledger entries.</li>
        <li>To secure the Service, prevent abuse, and meet legal obligations.</li>
      </ul>

      <h2>5. How we share information</h2>
      <p>We do not sell personal data. We share data only with:</p>
      <ul>
        <li>
          <strong>Service providers</strong> we use to run PGManage — cloud hosting (AWS,
          Mumbai/ap-south-1 region), Meta (WhatsApp message delivery), and email delivery providers
          — bound to process data only on our instructions.
        </li>
        <li>
          <strong>The PG operator</strong> who entered a resident's record, who controls that data
          as part of running their property.
        </li>
        <li>
          <strong>Authorities</strong> where required by applicable law.
        </li>
      </ul>

      <h2>6. Data retention</h2>
      <p>
        We retain business and resident records for as long as the operator's account is active, or
        as needed to comply with legal, tax, and accounting requirements. Operators may request
        deletion of resident records they control. Each organisation's data is isolated in its own
        database schema.
      </p>

      <h2>7. Security</h2>
      <p>
        We use encryption in transit (HTTPS), tenant data isolation, role-based access control, and
        access tokens with short lifetimes. No method of transmission or storage is completely
        secure, but we take reasonable measures to protect your information.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Subject to India's Digital Personal Data Protection Act, 2023 and other applicable law, you
        may request access to, correction of, or deletion of your personal data, and may withdraw
        consent for communications. Residents should contact their PG operator (the data fiduciary
        for their record) or email us and we will assist. To stop WhatsApp messages, reply STOP.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is intended for business use by PG operators and is not directed at children
        under 18.
      </p>

      <h2>10. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. Material changes will be reflected by the "Last
        updated" date above and, where appropriate, communicated within the Service.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this Policy or your data? Email{' '}
        <a href="mailto:thotaadityasaikumar@outlook.com">thotaadityasaikumar@outlook.com</a>.
      </p>
    </LegalLayout>
  );
}

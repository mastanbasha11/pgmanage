import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="12 June 2026">
      <p>
        These Terms govern your use of the PGManage application and the website at{' '}
        <a href="https://pgmanage.in">pgmanage.in</a> ("Service"), operated by{' '}
        <strong>LOOP Colving PG</strong> ("we", "us", "our"). By creating an account or using the
        Service, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        PGManage helps Paying Guest (PG) and hostel operators manage properties, beds, residents,
        rent, expenses, bookings, leads, and resident communications — including WhatsApp messages
        sent via the Meta WhatsApp Business Platform.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information and keep your credentials secure. You are responsible
        for all activity under your account and for your staff's use of the Service. You must be
        authorised to operate the property and to manage the resident data you enter.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose;</li>
        <li>upload or process other people's data without authority to do so;</li>
        <li>
          send spam, marketing, or any messages over WhatsApp without the recipient's consent;
        </li>
        <li>attempt to breach security, reverse-engineer, or disrupt the Service;</li>
        <li>
          violate Meta's{' '}
          <a href="https://www.whatsapp.com/legal/business-policy/">
            WhatsApp Business Messaging Policy
          </a>
          .
        </li>
      </ul>

      <h2>4. Resident data &amp; messaging</h2>
      <p>
        You are the controller of the resident data you enter and are responsible for having a
        lawful basis and the necessary consent to contact residents. You will only send
        transactional messages that residents reasonably expect from their PG. We may suspend
        messaging that violates Meta policy or generates abuse reports.
      </p>

      <h2>5. Payments &amp; records</h2>
      <p>
        Financial figures, ledgers, and receipts you record are your responsibility for accuracy.
        PGManage is a record-keeping tool and is not a payment processor, bank, or financial or
        legal advisor.
      </p>

      <h2>6. Availability</h2>
      <p>
        We aim for high availability but provide the Service "as is" and "as available" without a
        guarantee of uninterrupted operation. We may modify or discontinue features with reasonable
        notice where practicable.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The Service, its software, and branding are owned by LOOP Colving PG. Your data remains
        yours; you grant us a limited licence to host and process it solely to provide the Service.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, LOOP Colving PG is not liable for any indirect,
        incidental, or consequential damages, or for loss of data or profits arising from your use
        of the Service. Our total liability is limited to the fees you paid to us in the preceding
        12 months.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate accounts that
        violate these Terms. On termination, we handle your data in accordance with our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of India. Any disputes are subject to the exclusive
        jurisdiction of the competent courts at the operator's registered place of business in
        India.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes take
        effect constitutes acceptance of the updated Terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms? Email{' '}
        <a href="mailto:thotaadityasaikumar@outlook.com">thotaadityasaikumar@outlook.com</a>.
      </p>
    </LegalLayout>
  );
}

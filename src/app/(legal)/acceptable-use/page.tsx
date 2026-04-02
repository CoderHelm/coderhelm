export const metadata = {
  title: "Acceptable Use Policy",
  description: "Coderhelm Acceptable Use Policy. Guidelines for responsible use of the Coderhelm autonomous AI coding agent.",
  alternates: { canonical: "https://coderhelm.com/acceptable-use" },
};

export default function AcceptableUse() {
  return (
    <>
      <h1>Acceptable Use Policy</h1>
      <p><strong>Effective date:</strong> July 14, 2025</p>
      <p><strong>Last updated:</strong> March 28, 2026</p>

      <p>
        This Acceptable Use Policy (&quot;AUP&quot;) is part of your agreement with Coderhelm and
        applies to all users of the Coderhelm website, GitHub App, and dashboard (the &quot;Service&quot;).
        This AUP describes prohibited and restricted uses of the Service. Violations may result
        in immediate suspension or permanent termination of your access without prior notice.
      </p>

      <h2>1. Prohibited Uses</h2>
      <p>You may not use the Service to:</p>

      <h3>1.1 Malicious &amp; Harmful Code</h3>
      <ul>
        <li>Generate malware, viruses, ransomware, trojans, worms, or any other malicious software</li>
        <li>Generate code that facilitates unauthorized access to computer systems, networks, or data</li>
        <li>Generate exploit code, vulnerability scanners, or tools designed to attack systems</li>
        <li>Generate code designed to harass, threaten, stalk, or harm individuals</li>
        <li>Generate code that collects personal data without proper consent</li>
      </ul>

      <h3>1.2 Security &amp; Integrity</h3>
      <ul>
        <li>Bypass, circumvent, or test security controls, authentication mechanisms, or access
          restrictions of the Service or any third-party system</li>
        <li>Attempt to reverse-engineer, decompile, disassemble, or extract the Service&apos;s
          underlying models, algorithms, prompts, or training data</li>
        <li>Probe, scan, or test the vulnerability of the Service without prior written authorization</li>
        <li>Introduce viruses, worms, or other harmful code into the Service</li>
        <li>Interfere with or disrupt the integrity or performance of the Service</li>
      </ul>

      <h3>1.3 Intellectual Property &amp; Legal</h3>
      <ul>
        <li>Infringe on intellectual property rights, including using the Service to reproduce
          copyrighted code, proprietary algorithms, or trade secrets without authorization</li>
        <li>Generate code that violates any applicable local, state, national, or international
          law or regulation</li>
        <li>Use the Service in connection with illegal activities, fraud, or money laundering</li>
        <li>Misrepresent AI-generated code as entirely human-written in contexts where
          disclosure is required (e.g., certain open-source contributions)</li>
      </ul>

      <h3>1.4 Abuse &amp; Fair Usage</h3>
      <ul>
        <li>Abuse the Service through automated means, including creating fake or duplicate
          issues to artificially consume runs</li>
        <li>Share, sell, resell, sublicense, or transfer your account, installation credentials,
          or access tokens to unauthorized parties</li>
        <li>Use the Service in a way that degrades performance, availability, or quality for
          other users</li>
        <li>Create multiple free-tier accounts to circumvent usage limits</li>
        <li>Use the Service to benchmark or create a competing product</li>
      </ul>

      <h2>2. Rate Limits &amp; Usage Caps</h2>
      <p>We enforce per-tenant usage limits to ensure fair access for all users:</p>
      <ul>
        <li><strong>Free tier:</strong> 5 runs per calendar month</li>
        <li><strong>Pro plan:</strong> 100 runs per calendar month</li>
      </ul>
      <p>Runs reset on the first day of each calendar month (UTC). Unused runs do not carry over.
        If you reach your monthly limit, additional runs will be queued until the next billing cycle,
        or you may upgrade your plan.</p>
      <p>In addition to monthly caps, we may apply per-hour and per-day rate limits to prevent
        abuse patterns. Pro plan users receive priority queue placement over free-tier users during
        periods of high demand.</p>
      <p>We reserve the right to throttle or temporarily suspend accounts exhibiting usage
        patterns that significantly deviate from normal development workflows, even if within
        stated limits.</p>

      <h2>3. Content Standards</h2>
      <p>While Coderhelm generates code based on your issue descriptions and codebase, you are
        responsible for ensuring that your inputs (issue titles, descriptions, comments, and
        repository content) do not:</p>
      <ul>
        <li>Contain content that is unlawful, defamatory, obscene, or otherwise objectionable</li>
        <li>Attempt to manipulate the AI model into producing prohibited output through
          prompt injection or adversarial inputs</li>
        <li>Include sensitive credentials, secrets, or personally identifiable information
          in issue descriptions (use environment variables and secret management instead)</li>
      </ul>

      <h2>4. Reporting Violations</h2>
      <p>If you become aware of any violation of this AUP, please report it promptly to{" "}
        <a href="mailto:abuse@coderhelm.com">abuse@coderhelm.com</a>. Include as much detail as
        possible, including the nature of the violation and any supporting evidence. We will
        investigate all credible reports and take appropriate action.</p>

      <h2>5. Monitoring &amp; Enforcement</h2>
      <p>We reserve the right to monitor usage of the Service for compliance with this AUP.
        We may investigate suspected violations and take any action we deem appropriate,
        including but not limited to:</p>
      <ul>
        <li>Issuing a warning to the account holder</li>
        <li>Temporarily suspending access to the Service</li>
        <li>Permanently terminating the account and revoking the GitHub App installation</li>
        <li>Reporting illegal activity to appropriate law enforcement authorities</li>
        <li>Pursuing legal remedies for damages caused by the violation</li>
      </ul>
      <p>We will make reasonable efforts to notify affected users before or promptly after
        taking action, unless doing so would compromise security, enable further abuse, or
        violate applicable law.</p>

      <h2>6. Consequences of Violation</h2>
      <p>If your account is terminated for violation of this AUP:</p>
      <ul>
        <li>All access to the Service is revoked immediately</li>
        <li>Any prepaid subscription fees for the remaining billing period are forfeited</li>
        <li>You may be prohibited from creating new accounts or installations</li>
        <li>We may retain records of the violation for security and legal purposes</li>
      </ul>

      <h2>7. Changes to This Policy</h2>
      <p>We may update this AUP at any time. When we make material changes, we will update
        the &quot;Last updated&quot; date at the top of this page. Changes take effect
        immediately upon posting. Your continued use of the Service after changes constitutes
        acceptance of the revised AUP.</p>

      <h2>8. Contact</h2>
      <p>Questions about this Acceptable Use Policy? Contact us at:</p>
      <ul>
        <li>Abuse reports: <a href="mailto:abuse@coderhelm.com">abuse@coderhelm.com</a></li>
        <li>General inquiries: <a href="mailto:support@coderhelm.com">support@coderhelm.com</a></li>
      </ul>
    </>
  );
}

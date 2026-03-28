export const metadata = {
  title: "Acceptable Use Policy — d3ftly",
};

export default function AcceptableUse() {
  return (
    <>
      <h1>Acceptable Use Policy</h1>
      <p><strong>Effective date:</strong> July 14, 2025</p>

      <p>
        This Acceptable Use Policy (&quot;AUP&quot;) describes prohibited uses of the d3ftly
        Service. Violations may result in immediate suspension or termination.
      </p>

      <h2>1. Prohibited Uses</h2>
      <p>You may not use the Service to:</p>
      <ul>
        <li>Generate malware, viruses, ransomware, or any other malicious software</li>
        <li>Generate code that facilitates unauthorized access to systems or data</li>
        <li>Generate code designed to harass, threaten, or harm individuals</li>
        <li>Bypass security controls, authentication mechanisms, or access restrictions</li>
        <li>Infringe on intellectual property rights, including using the Service to
          reproduce copyrighted code without authorization</li>
        <li>Generate code that violates any applicable law or regulation</li>
        <li>Abuse the Service through automated means (e.g., creating fake issues to
          consume runs) beyond normal development workflow usage</li>
        <li>Attempt to reverse-engineer, decompile, or extract the Service&apos;s
          underlying models or algorithms</li>
        <li>Share your account or installation credentials with unauthorized parties</li>
        <li>Use the Service in a way that degrades performance for other users</li>
      </ul>

      <h2>2. Rate Limits</h2>
      <p>We enforce per-tenant rate limits to ensure fair usage. Free-tier users are limited
        to 20 runs per month. Paid users have no hard limit but may be throttled if usage
        significantly exceeds normal patterns.</p>

      <h2>3. Reporting Violations</h2>
      <p>If you become aware of any violation of this AUP, please report it to{" "}
        <a href="mailto:abuse@d3ftly.com">abuse@d3ftly.com</a>.
      </p>

      <h2>4. Enforcement</h2>
      <p>We may investigate suspected violations and take any action we deem appropriate,
        including warning the user, temporarily suspending access, or permanently terminating
        the account. We will make reasonable efforts to notify affected users unless doing so
        would compromise security or violate the law.</p>

      <h2>5. Changes</h2>
      <p>We may update this AUP at any time. Changes take effect upon posting to this page.</p>
    </>
  );
}

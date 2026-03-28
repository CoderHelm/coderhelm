export const metadata = {
  title: "Privacy Policy — d3ftly",
};

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p><strong>Effective date:</strong> July 14, 2025</p>

      <p>
        d3ftly (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the d3ftly.com website and
        the d3ftly GitHub App (collectively, the &quot;Service&quot;). This page informs you of
        our policies regarding the collection, use, and disclosure of personal data when you use
        our Service.
      </p>

      <h2>1. Information We Collect</h2>
      <p><strong>GitHub Account Data.</strong> When you install the GitHub App, we receive your
        GitHub username, email address, organization name, and repository metadata (names, default
        branches) via the GitHub API. We store your GitHub installation ID and organization name
        in our database to identify your tenant.</p>
      <p><strong>Source Code.</strong> When d3ftly processes an issue, it reads repository files
        via the GitHub API to understand context. Source code is processed in-memory and is
        <strong> never stored</strong> in our database, object storage, or logs.</p>
      <p><strong>Usage Data.</strong> We record run metadata (timestamps, token counts, cost,
        number of files modified, pass durations) to provide the dashboard and for billing.
        We do not log source code content.</p>

      <h2>2. How We Use Your Data</h2>
      <ul>
        <li>To provide, maintain, and improve the Service</li>
        <li>To process GitHub webhook events and perform coding tasks you request</li>
        <li>To display run history and usage statistics on the dashboard</li>
        <li>To send transactional emails (e.g., billing receipts)</li>
        <li>To detect and prevent abuse or security threats</li>
      </ul>

      <h2>3. Third-Party Services</h2>
      <p>We use the following third-party services:</p>
      <ul>
        <li><strong>Amazon Web Services (AWS)</strong> — infrastructure hosting, AI model inference (Bedrock), and data storage</li>
        <li><strong>GitHub</strong> — OAuth authentication and repository access via the GitHub App</li>
        <li><strong>Stripe</strong> — payment processing (if you upgrade to a paid plan)</li>
      </ul>
      <p>Each service has its own privacy policy. We do not sell or share your data with any party
        for advertising or marketing purposes.</p>

      <h2>4. Data Retention</h2>
      <p>Run metadata is retained for 90 days, after which it is automatically deleted.
        Tenant records are retained while your GitHub App installation is active. If you
        uninstall the app, we deactivate your tenant record and delete all associated data
        within 30 days.</p>

      <h2>5. Data Security</h2>
      <p>All data in transit is encrypted via TLS 1.2+. Data at rest is encrypted using
        AWS-managed keys (AES-256). GitHub App private keys and webhook secrets are stored
        in AWS Secrets Manager. Access to production infrastructure is restricted to authorized
        personnel.</p>

      <h2>6. Your Rights</h2>
      <p>You may request access to, correction of, or deletion of your personal data at any
        time by emailing <a href="mailto:privacy@d3ftly.com">privacy@d3ftly.com</a>. You can
        also uninstall the GitHub App at any time to revoke all repository access.</p>

      <h2>7. Children&apos;s Privacy</h2>
      <p>The Service is not directed to individuals under 16. We do not knowingly collect
        personal data from children.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material
        changes by posting the new policy on this page and updating the effective date. Your
        continued use of the Service after changes constitutes acceptance.</p>

      <h2>9. Contact</h2>
      <p>If you have questions about this Privacy Policy, contact us at{" "}
        <a href="mailto:privacy@d3ftly.com">privacy@d3ftly.com</a>.
      </p>
    </>
  );
}

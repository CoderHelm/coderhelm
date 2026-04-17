export const metadata = {
  title: "Privacy Policy",
  description: "Coderhelm Privacy Policy. Learn how we collect, use, and protect your data when you use the Coderhelm AI coding agent.",
  alternates: { canonical: "https://coderhelm.com/privacy" },
};

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p><strong>Effective date:</strong> July 14, 2025</p>
      <p><strong>Last updated:</strong> March 28, 2026</p>

      <p>
        Coderhelm (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the coderhelm.com website and
        the Coderhelm GitHub App (collectively, the &quot;Service&quot;). This Privacy Policy explains
        how we collect, use, disclose, and safeguard your information when you use our Service. Please
        read this policy carefully. By using the Service, you acknowledge the practices described herein.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Account &amp; Authentication Data</h3>
      <p>When you install the Coderhelm GitHub App, we receive the following via the GitHub API:</p>
      <ul>
        <li>GitHub username and associated email address</li>
        <li>GitHub user ID and avatar URL</li>
        <li>Organization name (if installed on an organization)</li>
        <li>GitHub App installation ID</li>
        <li>Repository names, default branches, and visibility settings for repos you grant access to</li>
      </ul>
      <p>We store your installation ID, organization name, and user identifiers in our database to manage
        your tenant and authenticate dashboard sessions.</p>

      <h3>1.2 Source Code &amp; Repository Content</h3>
      <p>When Coderhelm processes a GitHub issue, it reads repository files, directory structures, and
        CI configurations via the GitHub API to understand your codebase. <strong>Source code is processed
        entirely in-memory and is never persisted</strong> — it is not written to databases, object storage,
        log files, or any durable medium. Once a run completes, all in-memory code data is discarded.</p>

      <h3>1.3 Run &amp; Usage Metadata</h3>
      <p>For each run, we record:</p>
      <ul>
        <li>Run ID, status, and timestamps</li>
        <li>Issue/PR identifiers and titles</li>
        <li>Token counts (input/output) and estimated cost</li>
        <li>Number of files modified and pass durations</li>
        <li>Branch names and PR URLs</li>
      </ul>
      <p>This metadata powers the dashboard and usage tracking. It does not include source code content.</p>

      <h3>1.4 Jira Integration Data</h3>
      <p>If you connect a Jira workspace to Coderhelm, we receive the following via the Atlassian API:</p>
      <ul>
        <li>Jira OAuth access and refresh tokens (stored encrypted)</li>
        <li>Jira Cloud site ID and site URL</li>
        <li>Project keys, issue keys, and issue metadata (titles, descriptions, status)</li>
        <li>Atlassian account ID of the authorizing user</li>
      </ul>
      <p>Jira tokens are used solely to read and create issues on your behalf. They are stored
        encrypted at rest and can be revoked at any time from your Jira settings.</p>

      <h3>1.6 Google Authentication Data</h3>
      <p>If you sign in with Google, we receive the following via Google OAuth:</p>
      <ul>
        <li>Email address and email verification status</li>
        <li>Display name and profile picture URL</li>
      </ul>
      <p>We use this information solely to create and authenticate your dashboard account.
        We do not access your Google Drive, Gmail, Calendar, or any other Google services.</p>

      <h3>1.7 MCP Tool Integrations</h3>
      <p>Coderhelm supports user-configured Model Context Protocol (MCP) tool servers. When you
        configure an MCP server, the AI agent may send contextual data (such as file paths, code
        snippets, or issue metadata) to that server during a run. MCP servers are configured
        and controlled by you, and data is sent only at your direction. We do not operate or
        control third-party MCP servers, and their use is subject to their own privacy policies.</p>

      <h3>1.8 Automatically Collected Data</h3>
      <p>When you visit coderhelm.com, we may automatically collect:</p>
      <ul>
        <li>IP address and approximate geographic location</li>
        <li>Browser type, operating system, and device information</li>
        <li>Pages visited, referral URLs, and time spent on pages</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service</li>
        <li>Process GitHub webhook events and perform the coding tasks you request</li>
        <li>Authenticate you and manage your dashboard sessions</li>
        <li>Display run history, usage statistics, and billing information</li>
        <li>Send transactional emails (run completions, billing receipts, security alerts)</li>
        <li>Enforce rate limits and prevent abuse</li>
        <li>Respond to support requests and communicate with you about the Service</li>
        <li>Improve and optimize the Service&apos;s performance and user experience</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>3. Legal Bases for Processing (GDPR)</h2>
      <p>If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland,
        we process your personal data on the following legal bases:</p>
      <ul>
        <li><strong>Performance of a contract:</strong> Processing necessary to deliver the Service
          you signed up for (Article 6(1)(b) GDPR)</li>
        <li><strong>Legitimate interests:</strong> Processing necessary for our legitimate business
          interests, such as fraud prevention, security, and improving the Service, where these
          interests are not overridden by your rights (Article 6(1)(f) GDPR)</li>
        <li><strong>Consent:</strong> Where you have given consent for specific processing activities,
          such as marketing communications (Article 6(1)(a) GDPR)</li>
        <li><strong>Legal obligation:</strong> Processing necessary to comply with applicable laws
          (Article 6(1)(c) GDPR)</li>
      </ul>

      <h2>4. Disclosure &amp; Sharing of Information</h2>
      <p>We do not sell, rent, or trade your personal data. We may share information only in
        the following circumstances:</p>
      <ul>
        <li><strong>Service providers:</strong> With third-party vendors who assist in operating the
          Service (see Section 5), bound by data processing agreements</li>
        <li><strong>Legal requirements:</strong> When required by law, regulation, legal process,
          or governmental request</li>
        <li><strong>Safety &amp; security:</strong> To protect the rights, property, or safety of
          Coderhelm, our users, or the public</li>
        <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale
          of all or a portion of our assets, with notice to affected users</li>
      </ul>

      <h2>5. Sub-Processors &amp; Third-Party Services</h2>
      <p>We use the following third-party services to operate the Service:</p>
      <table>
        <thead>
          <tr><th>Provider</th><th>Purpose</th><th>Data Processed</th></tr>
        </thead>
        <tbody>
          <tr><td>Amazon Web Services (AWS)</td><td>Infrastructure hosting, compute, data storage, and transactional email delivery</td><td>All service data</td></tr>
          <tr><td>Anthropic</td><td>AI model inference for code generation and analysis</td><td>Source code (in-memory only), issue metadata</td></tr>
          <tr><td>GitHub</td><td>Authentication, repository access, webhook delivery</td><td>Account data, repository metadata</td></tr>
          <tr><td>Google (OAuth)</td><td>User authentication via Google Sign-In</td><td>Email, display name, profile picture</td></tr>
          <tr><td>Atlassian (Jira)</td><td>Issue tracking integration</td><td>Jira OAuth tokens, project/issue metadata</td></tr>
        </tbody>
      </table>
      <p>Each sub-processor operates under its own privacy policy and is bound by data
        processing agreements where applicable.</p>
      <p><strong>User-configured MCP servers:</strong> If you configure third-party MCP tool
        servers, data may be sent to those servers at your direction during runs. These are not
        Coderhelm sub-processors — you are responsible for evaluating their privacy practices.</p>

      <h2>6. International Data Transfers</h2>
      <p>Our Service infrastructure is located in the United States. If you access the Service
        from outside the United States, your information may be transferred to, stored, and
        processed in the United States. We ensure appropriate safeguards are in place for
        international transfers, including:</p>
      <ul>
        <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
        <li>Data processing agreements with all sub-processors</li>
        <li>Encryption of data in transit and at rest</li>
      </ul>

      <h2>7. Data Retention</h2>
      <ul>
        <li><strong>Run metadata:</strong> Retained for 90 days, then automatically deleted</li>
        <li><strong>Account/tenant data:</strong> Retained while your GitHub App installation is
          active. Upon uninstallation, tenant records are deactivated and all associated data is
          deleted within 30 days</li>
        <li><strong>Billing records:</strong> Retained as required by tax and accounting laws
          (typically 7 years for financial records)</li>
        <li><strong>Source code:</strong> Never persisted — discarded from memory immediately
          after each run</li>
      </ul>

      <h2>8. Data Breach Notification</h2>
      <p>In the event of a personal data breach that is likely to result in a risk to your rights
        and freedoms, we will notify affected users without undue delay and no later than 72 hours
        after becoming aware of the breach, as required by applicable law. Notification will be sent
        to the email address associated with your account and will include: the nature of the breach,
        the categories of data affected, the likely consequences, and the measures taken or proposed
        to address the breach.</p>

      <h2>9. Data Security</h2>
      <p>We implement industry-standard technical and organizational measures to protect your
        data, including:</p>
      <ul>
        <li>All data in transit encrypted via TLS 1.2+</li>
        <li>All data at rest encrypted using AES-256</li>
        <li>Secrets (API keys, webhook secrets, private keys) stored in a managed secrets vault</li>
        <li>Infrastructure access restricted via IAM policies and least-privilege principles</li>
        <li>Web Application Firewall (WAF) protecting all public endpoints</li>
        <li>Regular security reviews of application code and dependencies</li>
      </ul>
      <p>No method of transmission or storage is 100% secure. While we strive to protect your
        information, we cannot guarantee absolute security.</p>

      <h2>10. Cookies &amp; Tracking</h2>
      <p>The coderhelm.com website uses a session cookie (<code>coderhelm_session</code>) to maintain
        your authenticated dashboard session. This is a strictly necessary cookie and does not
        require consent under ePrivacy regulations.</p>
      <p>We do not use advertising cookies, third-party tracking pixels, or analytics services
        that track you across other websites. We do not participate in ad networks or
        cross-site tracking.</p>

      <h2>11. AI &amp; Automated Processing</h2>
      <p>Coderhelm uses large language models (LLMs) to analyze code and generate pull requests.
        This processing is automated and occurs on your behalf when you assign an issue. Key points:</p>
      <ul>
        <li>Your source code is sent to an AI model provider for inference only — it is not used
          for model training</li>
        <li>No human reviews your source code during normal operation of the Service</li>
        <li>You retain full control over whether to merge any AI-generated changes</li>
        <li>You may request information about how automated decisions affect your data by
          contacting us</li>
      </ul>

      <h2>12. Your Rights</h2>
      <p>Depending on your location, you may have the following rights:</p>

      <h3>All Users</h3>
      <ul>
        <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
        <li><strong>Correction:</strong> Request correction of inaccurate personal data</li>
        <li><strong>Deletion:</strong> Request deletion of your personal data</li>
        <li><strong>Uninstall:</strong> Revoke all repository access at any time by uninstalling
          the GitHub App</li>
      </ul>

      <h3>EEA / UK / Swiss Residents (GDPR)</h3>
      <ul>
        <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
        <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
        <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
        <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at
          any time without affecting prior processing</li>
        <li><strong>Lodge a complaint:</strong> File a complaint with your local data protection
          authority</li>
      </ul>

      <h3>California Residents (CCPA / CPRA)</h3>
      <ul>
        <li><strong>Right to know:</strong> Request the categories and specific pieces of personal
          information collected about you</li>
        <li><strong>Right to delete:</strong> Request deletion of personal information</li>
        <li><strong>Right to correct:</strong> Request correction of inaccurate personal
          information</li>
        <li><strong>Right to opt-out of sale:</strong> We do not sell personal information. No
          opt-out is necessary</li>
        <li><strong>Non-discrimination:</strong> We will not discriminate against you for
          exercising your CCPA rights</li>
      </ul>

      <p>To exercise any of these rights, email us at{" "}
        <a href="mailto:privacy@coderhelm.com">privacy@coderhelm.com</a>. We will respond within
        30 days (or as required by applicable law).</p>

      <h2>13. Children&apos;s Privacy</h2>
      <p>The Service is not directed to individuals under the age of 16. We do not knowingly
        collect personal data from children. If we become aware that a child under 16 has
        provided us with personal data, we will take steps to delete such information promptly.</p>

      <h2>14. Do Not Track</h2>
      <p>We do not track users across third-party websites and therefore do not respond to
        Do Not Track (DNT) signals. As noted in Section 10, we do not use third-party tracking
        technologies.</p>

      <h2>15. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. When we make material changes,
        we will update the &quot;Last updated&quot; date at the top of this page and, where
        required by law, notify you by email or through the Service. Your continued use of the
        Service after any changes constitutes acceptance of the updated policy.</p>

      <h2>16. Contact Us</h2>
      <p>If you have questions or concerns about this Privacy Policy or our data practices:</p>
      <ul>
        <li>Email: <a href="mailto:privacy@coderhelm.com">privacy@coderhelm.com</a></li>
        <li>General support: <a href="mailto:support@coderhelm.com">support@coderhelm.com</a></li>
      </ul>
    </>
  );
}

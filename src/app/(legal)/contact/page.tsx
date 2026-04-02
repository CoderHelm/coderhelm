export const metadata = {
  title: "Contact",
  description: "Contact Coderhelm for support, legal, or security inquiries about our autonomous AI coding agent.",
  alternates: { canonical: "https://coderhelm.com/contact" },
};

export default function Contact() {
  return (
    <>
      <h1>Contact Us</h1>

      <p>
        Have questions, feedback, or need help? We&apos;d love to hear from you.
      </p>

      <h2>General Support</h2>
      <p>
        For product questions, bug reports, or account help:
      </p>
      <p>
        <a href="mailto:support@coderhelm.com">support@coderhelm.com</a>
      </p>

      <h2>Legal &amp; Privacy</h2>
      <p>
        For legal inquiries, data requests, or privacy-related questions:
      </p>
      <p>
        <a href="mailto:legal@coderhelm.com">legal@coderhelm.com</a>
      </p>

      <h2>Security</h2>
      <p>
        To report a vulnerability or security concern:
      </p>
      <p>
        <a href="mailto:security@coderhelm.com">security@coderhelm.com</a>
      </p>
    </>
  );
}

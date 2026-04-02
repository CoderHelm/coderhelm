import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold">
              <span className="gradient-text">{"///"}</span>
              <span>Coderhelm</span>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              Ship code, not tickets.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-text-primary">Product</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a href="#features" className="hover:text-text-primary transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-text-primary transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-text-primary transition-colors">
                  How it works
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-text-primary">Legal</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <Link href="/privacy" className="hover:text-text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/acceptable-use" className="hover:text-text-primary transition-colors">
                  Acceptable Use
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-text-primary">Connect</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <Link href="/contact" className="hover:text-text-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <a href="https://app.coderhelm.com" className="hover:text-text-primary transition-colors">
                  Dashboard
                </a>
              </li>
              <li>
                <a href="mailto:support@coderhelm.com" className="hover:text-text-primary transition-colors">
                  support@coderhelm.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-surface-border pt-6 text-center text-xs text-text-muted">
          &copy; {new Date().getFullYear()} Coderhelm. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

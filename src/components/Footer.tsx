import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold">
              <span className="gradient-text">{"///"}</span>
              <span>d3ftly</span>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              Your code, d3ftly handled.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">Product</h4>
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
            <h4 className="mb-3 text-sm font-semibold">Legal</h4>
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
            <h4 className="mb-3 text-sm font-semibold">Connect</h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="https://github.com/nambok/d3ftly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-text-primary transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a href="mailto:support@d3ftly.com" className="hover:text-text-primary transition-colors">
                  support@d3ftly.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-surface-border pt-6 text-center text-xs text-text-muted">
          &copy; {new Date().getFullYear()} d3ftly. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

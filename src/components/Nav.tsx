"use client";

import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-surface-border bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="gradient-text">{"///"}</span>
          <span>Coderhelm</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            How it works
          </a>
          <a href="#open-source" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Open Source
          </a>
          <a
            href="https://github.com/CoderHelm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
          <a
            href="https://app.coderhelm.com"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Login
          </a>
          <a
            href="https://app.coderhelm.com"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Sign Up
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-text-secondary"
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-surface-border bg-surface px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <a href="#features" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Features
            </a>
            <a href="#how-it-works" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              How it works
            </a>
            <a href="#open-source" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Open Source
            </a>
            <a href="https://github.com/CoderHelm" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              GitHub
            </a>
            <a
              href="https://app.coderhelm.com"
              className="text-sm text-text-secondary"
            >
              Login
            </a>
            <a
              href="https://app.coderhelm.com"
              className="rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-black"
            >
              Sign Up
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

import Link from "next/link";
import { primaryButton, secondaryButton } from "@/components/ui";
import { Page } from "@/components/page";

// Shown inside the app shell for a link to a page that does not exist. The
// default Next.js page is styled for a white background and has no way back.
export default function NotFound() {
  return (
    <Page>
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="mt-2 text-2xl font-bold text-zinc-100">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-400">
        This page does not exist or has moved. Check the address, or pick a page from the menu.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className={primaryButton}>
          Go to runs
        </Link>
        <Link href="/plans" className={secondaryButton}>
          Go to plans
        </Link>
      </div>
    </div>
    </Page>
  );
}

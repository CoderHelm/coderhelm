"use client";

import { useInstallAdmin } from "@/lib/install";
import { Page, PageHeader } from "@/components/page";
import { Redirect } from "@/components/redirect";
import { SignInAppsPanel } from "@/components/sign-in-apps";

/**
 * Settings, Sign-in apps (self-hosted installs, install admins): the OAuth
 * apps people sign in to connectors with. On hosted it is part of the
 * platform's Admin page, which a self-hosted install doesn't have.
 */
export default function SignInAppsPage() {
  const { ready, allowed } = useInstallAdmin();
  if (!ready) return null;
  if (!allowed) {
    return (
      <Page>
        <div className="mt-8">
          <Redirect to="/settings/" />
        </div>
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader title="Sign-in apps" lead="The apps people sign in to Notion, Google Drive and other connectors with, and which ones are set up." />
      <div className="mt-8">
        <SignInAppsPanel />
      </div>
    </Page>
  );
}

// What the sign-in screen says when Google, GitHub, Microsoft or Okta sign-in
// did not finish. The API's callback sends the person back here with
// `?signin_error=<code>&provider=<google|github|microsoft|okta>` (services/gateway
// oauth_signin.rs); the URL carries only that short code, and this turns it
// into one plain sentence.

export type SignInProvider = "google" | "github" | "microsoft" | "okta";

export interface SignInProblem {
  code: string;
  provider: SignInProvider | null;
  /** One sentence for the person. */
  sentence: string;
  /** Trying again in this browser can work. False when the browser itself is the problem. */
  canRetry: boolean;
}

const NAMES: Record<SignInProvider, string> = { google: "Google", github: "GitHub", microsoft: "Microsoft", okta: "Okta" };

function providerOf(p: string | null): SignInProvider | null {
  return p === "google" || p === "github" || p === "microsoft" || p === "okta" ? p : null;
}

export function signInProblem(search: string): SignInProblem | null {
  const params = new URLSearchParams(search);
  const code = params.get("signin_error");
  if (!code) return null;
  const p = params.get("provider");
  const provider = providerOf(p);
  const name = provider ? NAMES[provider] : "The sign-in provider";
  switch (code) {
    case "in_app_browser":
      return {
        code,
        provider,
        sentence: "Google sign-in doesn't work in an app's built-in browser, so open this page in Safari or Chrome to continue.",
        canRetry: false,
      };
    case "expired":
      return {
        code,
        provider,
        sentence: "Sign-in finished in a different browser or app than it started in, or took longer than 10 minutes.",
        canRetry: true,
      };
    case "cancelled":
      return { code, provider, sentence: `Sign-in with ${provider ? NAMES[provider] : "the provider"} was cancelled before it finished.`, canRetry: true };
    case "provider":
      return { code, provider, sentence: `${name} didn't confirm your sign-in.`, canRetry: true };
    case "not_set_up":
      return {
        code,
        provider,
        sentence: `${provider ? NAMES[provider] : "That"} sign-in isn't set up on this Coderhelm. Sign in with your email and password.`,
        canRetry: false,
      };
    case "no_verified_email":
      return {
        code,
        provider,
        sentence:
          provider === "microsoft"
            ? "Microsoft didn't share a verified email address for this account, so Coderhelm can't tell who you are. Ask your IT team to check the Coderhelm app's email claims, or sign in another way."
            : `${name} didn't share a verified email address for this account. Ask your IT team, or sign in another way.`,
        canRetry: false,
      };
    case "okta_not_found":
      return {
        code,
        provider,
        sentence: "There's no Okta sign-in for that email here. Check the address, or sign in another way. An admin turns Okta on in Settings, Sign-in rules.",
        canRetry: false,
      };
    case "not_on_team":
      return {
        code,
        provider,
        sentence: "Okta signed you in, but you aren't on the team that uses this Okta. Ask one of its admins to invite you with that email.",
        canRetry: false,
      };
    case "server":
      return { code, provider, sentence: "Something went wrong on our side while signing you in.", canRetry: true };
    default:
      return { code, provider, sentence: "Sign-in didn't finish.", canRetry: true };
  }
}

/** Android can hand the page to Chrome from inside another app's browser. */
export function openInChromeHref(url: string, userAgent: string): string | null {
  if (!/Android/.test(userAgent)) return null;
  try {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

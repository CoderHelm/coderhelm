// What the sign-in screen says when Google, GitHub, Microsoft or Okta sign-in
// did not finish. The API's callback sends the person back here with
// `?signin_error=<code>&provider=<google|github|microsoft|okta>` (services/gateway
// oauth_signin.rs); the URL carries only that short code, and this turns it
// into one plain sentence. `okta_required` may also carry `&team_id=<id>`: the
// team's id only, sent back with the owner's break-glass sign-in, never shown.

export type SignInProvider = "google" | "github" | "microsoft" | "okta";

export interface SignInProblem {
  code: string;
  provider: SignInProvider | null;
  /** One sentence for the person. */
  sentence: string;
  /** Trying again in this browser can work. False when the browser itself is the problem. */
  canRetry: boolean;
  /** `okta_required`: the team's id from the URL (never shown). */
  teamId?: string;
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
        sentence: "Okta signed you in, but you aren't a member of the team that uses this Okta. Okta works only for people already on the team: accept your invite with your password, Google, GitHub or Microsoft first.",
        canRetry: false,
      };
    case "okta_not_linked":
      return {
        code,
        provider,
        sentence: "Okta signed you in, but no Coderhelm account has linked that Okta account yet. Sign in another way first, then choose Link Okta in Settings, Security.",
        canRetry: false,
      };
    case "okta_team_only":
      return {
        code,
        provider,
        sentence: "You signed in with your team's Okta, which works for that team only, so it can't link another sign-in. Sign in with your password, Google, GitHub or Microsoft to do this.",
        canRetry: false,
      };
    case "okta_required": {
      // The team (self-hosted: the organization) takes only its own Okta. The
      // URL names the team by id only, for the owner's break-glass sign-in;
      // no text from the URL is shown.
      const teamId = (params.get("team_id") || "").trim();
      return {
        code,
        provider,
        teamId,
        sentence: "Your team requires Okta sign-in. Sign in with Okta using your work email.",
        canRetry: false,
      };
    }
    case "okta_ask_admin":
      return {
        code,
        provider,
        sentence: "Your team requires Okta sign-in and your account isn't linked to Okta yet. Ask an admin.",
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

// What the sign-in screen says when Google, GitHub, Microsoft or Okta sign-in
// did not finish. The API's callback sends the person back here with
// `?signin_error=<code>&provider=<google|github|microsoft|okta>` (services/gateway
// oauth_signin.rs); the URL carries only that short code, and this turns it
// into one plain sentence. `sso_required` also carries `&sso=<okta|microsoft>`
// and `&team_id=<id>`: which provider the team takes, so the page can start that
// sign-in, and the team's id, never shown.

export type SignInProvider = "google" | "github" | "microsoft" | "okta";

export interface SignInProblem {
  code: string;
  provider: SignInProvider | null;
  /** One sentence for the person. */
  sentence: string;
  /** Trying again in this browser can work. False when the browser itself is the problem. */
  canRetry: boolean;
  /** `sso_required`: the team's id from the URL (never shown). */
  teamId?: string;
  /** `sso_required`: the provider the team requires. */
  sso?: SsoProvider;
}

/** The identity providers a team can require. */
export type SsoProvider = "okta" | "microsoft";

export const SSO_NAMES: Record<SsoProvider, string> = { okta: "Okta", microsoft: "Microsoft Entra" };

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
        sentence: `${provider ? NAMES[provider] : "That"} sign-in isn't set up on this CoderHelm. Sign in with your email and password.`,
        canRetry: false,
      };
    case "no_verified_email":
      return {
        code,
        provider,
        sentence:
          provider === "microsoft"
            ? "Microsoft didn't share a verified email address for this account, so CoderHelm can't tell who you are. Ask your IT team to check the CoderHelm app's email claims, or sign in another way."
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
        sentence: "Okta signed you in, but no CoderHelm account has linked that Okta account yet. Sign in another way first, then choose Link Okta in Settings, Security.",
        canRetry: false,
      };
    case "okta_team_only":
      return {
        code,
        provider,
        sentence: "You signed in with your team's Okta, which works for that team only, so it can't link another sign-in. Sign in with your password, Google, GitHub or Microsoft to do this.",
        canRetry: false,
      };
    case "sso_required": {
      // The team (self-hosted: the organization) takes only its own provider.
      // The URL names the team by id and the provider by its slug only; no
      // text from the URL is shown.
      const teamId = (params.get("team_id") || "").trim();
      const sso: SsoProvider = params.get("sso") === "microsoft" ? "microsoft" : "okta";
      return {
        code,
        provider,
        teamId,
        sso,
        sentence: `Your team requires single sign-on with ${SSO_NAMES[sso]}. Sign in with ${SSO_NAMES[sso]}.`,
        canRetry: false,
      };
    }
    case "sso_ask_admin":
      return {
        code,
        provider,
        sentence: "Your team requires single sign-on and your account isn't linked yet. Ask an admin for a one-time link.",
        canRetry: false,
      };
    case "sso_not_linked":
      return {
        code,
        provider,
        sentence: "Microsoft signed you in, but no CoderHelm account has linked that account yet. Sign in another way first, then choose Link Microsoft in Settings, Security.",
        canRetry: false,
      };
    case "sso_claim_invalid": {
      const why = params.get("reason");
      return {
        code,
        provider,
        sentence:
          why === "used"
            ? "That one-time link was already used. Ask an admin for a new one."
            : why === "expired"
              ? "That one-time link expired. Ask an admin for a new one."
              : why === "rule_off"
                ? "That one-time link no longer applies: your team doesn't require single sign-on now. Sign in the usual way."
                : "That link doesn't work. Ask an admin for a new one.",
        canRetry: false,
      };
    }
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

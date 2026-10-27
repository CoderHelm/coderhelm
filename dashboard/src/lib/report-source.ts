/**
 * The Tests setting "Where test reports are stored", checked the way the
 * gateway checks it (`common::e2e::report_source`), so a person sees the
 * problem before saving.
 */

const PLACEHOLDERS = ["{run_id}", "{attempt}"];

export type ParsedLocation = { kind: "ci" } | { kind: "s3"; bucket: string; pattern: string };

/** The location, or why it can't be used. Empty means none. */
export function parseLocation(raw: string): { ok: true; location: ParsedLocation | null } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: true, location: null };
  if (["ci", "ci artifacts", "ci-artifacts", "github", "github-artifacts"].includes(s.toLowerCase())) return { ok: true, location: { kind: "ci" } };
  if (!s.startsWith("s3://")) return { ok: false, error: "Enter an S3 location like s3://bucket/reports/{run_id}/{attempt}/, or ci for the run's GitHub Actions artifacts." };
  const rest = s.slice(5);
  const slash = rest.indexOf("/");
  const bucket = slash === -1 ? rest : rest.slice(0, slash);
  const pattern = slash === -1 ? "" : rest.slice(slash + 1);
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) return { ok: false, error: `${bucket || "The bucket"} isn't a valid S3 bucket name.` };
  if (/[\s'"\\]/.test(s)) return { ok: false, error: "The location can't contain spaces, quotes or backslashes." };
  for (const m of pattern.match(/\{[^}]*\}?/g) ?? []) {
    if (!PLACEHOLDERS.includes(m)) return { ok: false, error: `${m} isn't a placeholder Coderhelm fills in; use {run_id} and {attempt}.` };
  }
  if (!pattern.includes("{run_id}")) return { ok: false, error: "The location needs {run_id}, so each run's report can be found." };
  return { ok: true, location: { kind: "s3", bucket, pattern: pattern.replace(/^\/+/, "") } };
}

/** Why a test address can't be used, or null. */
export function targetError(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\/[^/?#\s]+/.test(s)) return "Enter the address the tests run against, like https://staging.example.com.";
  if (/[\s'"`\\$;]/.test(s)) return "The address can't contain spaces, quotes or shell characters.";
  for (const m of s.match(/\{[^}]*\}?/g) ?? []) if (m !== "{pr}") return `${m} isn't a placeholder here; only {pr} is filled in.`;
  return null;
}

/** The IAM statement the team's read-only role needs to read an S3 location. */
export function readStatement(loc: ParsedLocation): string | null {
  if (loc.kind !== "s3") return null;
  const cut = loc.pattern.indexOf("{");
  const prefix = cut === -1 ? loc.pattern : loc.pattern.slice(0, cut);
  return JSON.stringify(
    {
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:ListBucket"],
      Resource: [`arn:aws:s3:::${loc.bucket}`, `arn:aws:s3:::${loc.bucket}/${prefix}*`],
    },
    null,
    2,
  );
}

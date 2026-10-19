import { Redirect } from "@/components/redirect";

/** Moved to Settings → Integrations. */
export default function Moved() {
  return <Redirect to="/settings/integrations/aws/" />;
}

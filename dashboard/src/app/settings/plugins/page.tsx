import { Redirect } from "@/components/redirect";

/** MCP servers are cards on Settings → Integrations now. */
export default function Moved() {
  return <Redirect to="/settings/integrations/" hash="#other-tools" />;
}

import { Redirect } from "@/components/redirect";

/** MCP servers have their own page now: Connections. */
export default function Moved() {
  return <Redirect to="/connections/" />;
}

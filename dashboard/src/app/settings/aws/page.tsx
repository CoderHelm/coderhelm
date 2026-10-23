import { Redirect } from "@/components/redirect";

/**
 * Moved. Chat messages about new log findings linked here, so this opens the
 * Logs page; the AWS connection itself is under Settings → Integrations.
 */
export default function Moved() {
  return <Redirect to="/logs/" />;
}

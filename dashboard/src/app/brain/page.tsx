import { Redirect } from "@/components/redirect";

// The chat moved to /chat. The thread in the address (?thread=) comes along,
// so a bookmarked or shared conversation still opens.
export default function BrainPage() {
  return <Redirect to="/chat/" />;
}

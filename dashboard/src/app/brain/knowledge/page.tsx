import { Redirect } from "@/components/redirect";
import { KNOWLEDGE_HREF } from "@/lib/routes";

// Knowledge moved to its own page; old links and bookmarks land there.
export default function MovedKnowledge() {
  return <Redirect to={KNOWLEDGE_HREF} />;
}

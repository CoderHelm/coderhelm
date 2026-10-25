import { Redirect } from "@/components/redirect";
import { KNOWLEDGE_HREF } from "@/lib/routes";

// A knowledge base's old address; the query (`?id=`) is kept.
export default function MovedKnowledgeBase() {
  return <Redirect to={`${KNOWLEDGE_HREF}base/`} />;
}

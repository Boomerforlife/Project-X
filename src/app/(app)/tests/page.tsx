import { permanentRedirect } from "next/navigation";
import { routes } from "@/lib/routes";

/** Papers now live under PYQs (UX audit 2026-11-28): the paper list is /jee/pyq/, attempt history is Progress → Tests. */
export default function TestsPage() {
  permanentRedirect(routes.pyq("jee"));
}

import { Suspense } from "react";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { PageSkeleton } from "@/components/ui/Primitives";

// Private admin overview: the (app) layout already sets noindex; the API enforces the ADMIN role.
export const metadata = { title: "Admin" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

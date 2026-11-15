import { Suspense } from "react";
import { CheckoutSuccess } from "@/components/billing/CheckoutStatus";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Payment" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckoutSuccess />
    </Suspense>
  );
}

import { Suspense } from "react";
import { CheckoutCancelled } from "@/components/billing/CheckoutStatus";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Checkout closed" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckoutCancelled />
    </Suspense>
  );
}

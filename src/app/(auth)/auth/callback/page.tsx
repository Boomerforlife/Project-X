import { Suspense } from "react";
import { OAuthCallback } from "@/components/app/AuthForms";
import { PageSkeleton } from "@/components/ui/Primitives";

// Private and noindex through the (auth) layout.
export const metadata = { title: "Signing you in" };

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OAuthCallback />
    </Suspense>
  );
}

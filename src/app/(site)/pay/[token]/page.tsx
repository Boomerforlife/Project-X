import { Suspense } from "react";
import { PayLink } from "@/components/billing/PayLink";
import { PageSkeleton } from "@/components/ui/Primitives";
import { PRIVATE_METADATA } from "@/lib/seo";

// Payment links are private and short-lived: never indexed, never cached.
export const metadata = { ...PRIVATE_METADATA, title: "Payment link" };

async function FromParams({ params }: { params: PageProps<"/pay/[token]">["params"] }) {
  const { token } = await params;
  return <PayLink token={token} />;
}

export default function Page({ params }: PageProps<"/pay/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FromParams params={params} />
    </Suspense>
  );
}

import { PayLink } from "@/components/billing/PayLink";
import { PRIVATE_METADATA } from "@/lib/seo";

// Payment links are private and short-lived: never indexed, never cached.
export const metadata = { ...PRIVATE_METADATA, title: "Payment link" };

export default async function Page({ params }: PageProps<"/pay/[token]">) {
  const { token } = await params;
  return <PayLink token={token} />;
}

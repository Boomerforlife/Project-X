import { notFound } from "next/navigation";
import { PaperDetail } from "@/components/app/Papers";
import { getPaper, getPapers } from "@/lib/data";

export async function generateStaticParams() {
  return (await getPapers()).map((p) => ({ paperId: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/tests/[paperId]">) {
  const p = await getPaper((await params).paperId);
  return p ? { title: p.title } : {};
}

export default async function PaperPage({ params }: PageProps<"/tests/[paperId]">) {
  const { paperId } = await params;
  if (!(await getPaper(paperId))) notFound();
  return <PaperDetail paperId={paperId} />;
}

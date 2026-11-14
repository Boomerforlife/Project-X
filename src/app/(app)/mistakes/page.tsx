import { NotebookPage } from "@/components/app/Notebook";

export const metadata = { title: "Mistake notebook" };

export default function Page() {
  return <NotebookPage kind="mistakes" />;
}

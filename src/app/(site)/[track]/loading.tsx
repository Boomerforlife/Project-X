import { ListSkeleton, Skeleton } from "@/components/ui/Primitives";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-10 h-4 w-28" />
          <Skeleton className="mt-4 h-12 w-96 max-w-full" />
          <Skeleton className="mt-4 h-5 w-[32rem] max-w-full" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ListSkeleton rows={6} />
      </div>
    </div>
  );
}

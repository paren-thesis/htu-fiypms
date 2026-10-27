import { Skeleton } from "@/components/ui/skeleton";

export default function ChaptersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Progress banner skeleton */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      {/* Milestone timeline skeleton */}
      <div className="space-y-4 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <Skeleton className="h-28 flex-1 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

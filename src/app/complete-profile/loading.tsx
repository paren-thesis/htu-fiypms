import { Skeleton } from "@/components/ui/skeleton";

export default function CompleteProfileLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="flex justify-between pt-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}

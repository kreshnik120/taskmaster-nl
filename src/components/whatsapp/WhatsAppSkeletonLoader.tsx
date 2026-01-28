import { Skeleton } from "@/components/ui/skeleton";

interface ChatListSkeletonProps {
  count?: number;
}

export function ChatListSkeleton({ count = 8 }: ChatListSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border-b border-border/50">
          <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </>
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Date divider skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      
      {/* Incoming messages */}
      <div className="flex justify-start">
        <Skeleton className="h-16 w-64 rounded-2xl rounded-bl-none" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-12 w-48 rounded-2xl rounded-bl-none" />
      </div>
      
      {/* Outgoing messages */}
      <div className="flex justify-end">
        <Skeleton className="h-20 w-72 rounded-2xl rounded-br-none" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-56 rounded-2xl rounded-br-none" />
      </div>
      
      {/* More incoming */}
      <div className="flex justify-start">
        <Skeleton className="h-14 w-52 rounded-2xl rounded-bl-none" />
      </div>
    </div>
  );
}

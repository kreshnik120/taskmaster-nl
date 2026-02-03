import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md",
        "bg-white/40 dark:bg-slate-800/40",
        "backdrop-blur-sm",
        "border border-white/20 dark:border-white/10",
        // Premium shimmer effect
        "skeleton-shimmer",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };

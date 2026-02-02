import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, size = 'sm', ...props }, ref) => {
  const heightClasses = {
    xs: 'h-0.5',   // 2px
    sm: 'h-1',     // 4px - Apple default
    md: 'h-1.5',   // 6px
    lg: 'h-2',     // 8px
  };

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        "bg-white/40 dark:bg-slate-800/40",
        "backdrop-blur-sm",
        "border border-white/20 dark:border-white/10",
        heightClasses[size],
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary transition-all duration-300 ease-out rounded-full",
          "shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.1)]"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

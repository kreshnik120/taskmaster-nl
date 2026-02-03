import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg px-3 py-2 text-base md:text-sm",
          // Premium glass background
          "bg-white/50 dark:bg-slate-900/50",
          "backdrop-blur-sm",
          // Border styling
          "border border-white/30 dark:border-white/15",
          // INNER SHADOW voor depth (Apple style)
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]",
          // Focus state - gradient glow
          "ring-offset-background",
          "focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-tab-mijn-werk-500/20",
          "focus-visible:ring-offset-2",
          "focus-visible:bg-white/70 dark:focus-visible:bg-slate-900/70",
          "focus-visible:border-tab-mijn-werk-400/50",
          "focus-visible:shadow-[0_0_0_3px_hsla(234,45%,52%,0.08),inset_0_1px_2px_rgba(0,0,0,0.06)]",
          // File input styling
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Placeholder
          "placeholder:text-muted-foreground/60",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-all duration-200",
          // Chrome autofill override
          "[&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgba(255,255,255,0.9)]",
          "[&:-webkit-autofill]:[-webkit-text-fill-color:hsl(var(--foreground))]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

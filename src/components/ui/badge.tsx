import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Apple-style variants - minimal, clean
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-muted text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "text-foreground border-border",
        // Apple-style subtle variants
        success: "border-transparent bg-green-500/10 text-green-700 dark:text-green-400",
        warning: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400",
        info: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-400",
        // Ghost variant - ultra subtle
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-muted",
        // Glass variant - visionOS style with enhanced depth
        glass: "border-white/40 bg-white/60 backdrop-blur-md text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.2)] dark:border-white/20 dark:bg-slate-800/60",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

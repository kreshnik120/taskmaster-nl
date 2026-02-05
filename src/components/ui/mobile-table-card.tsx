 import { Card, CardContent } from '@/components/ui/card';
 import { cn } from '@/lib/utils';
 import type { ReactNode } from 'react';
 
 interface MobileTableCardProps {
   /** Primary content - the main title or text */
   primary: ReactNode;
   /** Secondary content - subtitle or description */
   secondary?: ReactNode;
   /** Leading element - icon, avatar, checkbox */
   leading?: ReactNode;
   /** Trailing element - badge, status, actions */
   trailing?: ReactNode;
   /** Meta information row - badges, dates, etc */
   meta?: ReactNode;
   /** Action buttons row */
   actions?: ReactNode;
   /** Card click handler */
   onClick?: () => void;
   /** Additional CSS classes */
   className?: string;
   /** ARIA role for accessibility */
   role?: string;
   /** ARIA label for accessibility */
   ariaLabel?: string;
   /** Whether to show a border highlight (e.g., for urgent/overdue items) */
   highlight?: 'destructive' | 'warning' | 'success' | 'primary';
 }
 
 /**
  * Generic mobile card component for replacing table rows on mobile
  * Follows Apple-style glassmorphism design with 44px touch targets
  */
 export function MobileTableCard({
   primary,
   secondary,
   leading,
   trailing,
   meta,
   actions,
   onClick,
   className,
   role = 'listitem',
   ariaLabel,
   highlight,
 }: MobileTableCardProps) {
   const highlightClasses = {
     destructive: 'border-destructive/50',
     warning: 'border-amber-500/50',
     success: 'border-green-500/50',
     primary: 'border-primary/50',
   };
 
   return (
     <Card
       role={role}
       aria-label={ariaLabel}
       className={cn(
         "transition-all duration-200",
         "bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm",
         "border-white/40 dark:border-white/12",
         "shadow-[0_2px_6px_hsla(215,25%,48%,0.06)]",
         onClick && [
           "cursor-pointer",
           "hover:bg-white/90 dark:hover:bg-slate-800/90",
           "hover:shadow-[0_4px_12px_hsla(215,25%,48%,0.12)]",
           "active:scale-[0.99]",
         ],
         highlight && highlightClasses[highlight],
         className
       )}
       onClick={onClick}
     >
       <CardContent className="p-4">
         {/* Header row: leading + primary + trailing */}
         <div className="flex items-start gap-3">
           {leading && (
             <div className="shrink-0 flex items-center min-h-[44px]">
               {leading}
             </div>
           )}
           <div className="flex-1 min-w-0">
             <div className="flex items-start justify-between gap-2">
               <div className="font-medium line-clamp-2 flex-1">{primary}</div>
               {trailing && <div className="shrink-0">{trailing}</div>}
             </div>
             {secondary && (
               <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                 {secondary}
               </div>
             )}
           </div>
         </div>
 
         {/* Meta row */}
         {meta && (
           <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-muted-foreground">
             {meta}
           </div>
         )}
 
         {/* Actions row */}
         {actions && (
           <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/50">
             {actions}
           </div>
         )}
       </CardContent>
     </Card>
   );
 }
 
 /**
  * Container for mobile card list with proper accessibility
  */
 export function MobileTableCardList({
   children,
   className,
   ariaLabel = 'Lijst',
 }: {
   children: ReactNode;
   className?: string;
   ariaLabel?: string;
 }) {
   return (
     <div
       className={cn("flex flex-col gap-3", className)}
       role="list"
       aria-label={ariaLabel}
     >
       {children}
     </div>
   );
 }
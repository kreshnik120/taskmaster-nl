import { cn } from "@/lib/utils";
import { getDateUrgency, getUrgencyBadgeClasses, formatDate } from "@/lib/dateFormatters";

interface UrgencyBadgeProps {
  dueAt: string | null;
  showDate?: boolean;
  className?: string;
}

/**
 * Enterprise-level urgency badge component with subtle pill styling and status dots
 */
export function UrgencyBadge({ dueAt, showDate = true, className }: UrgencyBadgeProps) {
  const urgency = getDateUrgency(dueAt);
  const badgeClasses = getUrgencyBadgeClasses(urgency.status);
  
  if (urgency.status === 'none' && !showDate) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showDate && dueAt && (
        <span className={cn(
          "text-sm tabular-nums",
          urgency.className
        )}>
          {formatDate(dueAt)}
        </span>
      )}
      {urgency.badge && (
        <span className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
          badgeClasses.container
        )}>
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            badgeClasses.dot
          )} />
          {urgency.badge}
        </span>
      )}
    </div>
  );
}

/**
 * Compact urgency indicator with just the dot and optional badge text
 */
export function UrgencyDot({ dueAt, showText = false, className }: UrgencyBadgeProps & { showText?: boolean }) {
  const urgency = getDateUrgency(dueAt);
  const badgeClasses = getUrgencyBadgeClasses(urgency.status);
  
  if (urgency.status === 'none' || urgency.status === 'normal') {
    return null;
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1",
      showText && cn("px-2 py-0.5 rounded-full text-xs font-medium", badgeClasses.container),
      className
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full flex-shrink-0",
        badgeClasses.dot
      )} />
      {showText && urgency.badge}
    </span>
  );
}

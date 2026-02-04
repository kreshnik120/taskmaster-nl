import { cn } from "@/lib/utils";

export type ContextColor = 
  | "rose" 
  | "violet" 
  | "slate" 
  | "teal" 
  | "amber" 
  | "emerald" 
  | "indigo" 
  | "blue";

interface PageContainerProps {
  contextColor: ContextColor;
  children: React.ReactNode;
  className?: string;
  withNoise?: boolean;
  withVignette?: boolean;
}

/**
 * Enterprise-niveau Page Container met 3-Tier Background Systeem
 * 
 * Combineert automatisch:
 * - Tier 1: Page background tint (context-specifieke kleur)
 * - Tier 2: Versterkte ambient mesh orbs
 * - Tier 3: Optionele noise texture en vignette
 * 
 * @example
 * <PageContainer contextColor="teal">
 *   <PageHero title="Plaatsingen" />
 *   {content}
 * </PageContainer>
 */
export function PageContainer({ 
  contextColor, 
  children, 
  className,
  withNoise = false,
  withVignette = true
}: PageContainerProps) {
  return (
    <div className={cn(
      "min-h-full relative",
      // Tier 1: Page background tint
      `page-bg-${contextColor}`,
      // Tier 2: Enhanced ambient mesh orbs  
      `glass-ambient-mesh-${contextColor}`,
      // Tier 3: Optional effects
      withVignette && "page-vignette",
      withNoise && "page-noise-texture",
      className
    )}>
      {children}
    </div>
  );
}

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getStatusColor, TRANSITIONS } from "@/lib/constants/designTokens";

interface ProfessionalAvatarProps {
  name?: string;
  photoUrl?: string;
  status?: string;
  functieNiveau?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

/**
 * Apple-style unified professional avatar component
 * Includes: photo, initials fallback, status dot, functie-based color
 */
export function ProfessionalAvatar({
  name = '',
  photoUrl,
  status,
  functieNiveau,
  size = 'md',
  showStatus = true,
  className,
}: ProfessionalAvatarProps) {
  // Get initials from name
  const getInitials = (name: string): string => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Get avatar background color based on functie niveau
  const getFunctieColor = (functie?: string): string => {
    const colors: Record<string, string> = {
      'WO': 'bg-red-600',
      'HBO': 'bg-blue-600',
      'HBO-V': 'bg-blue-500',
      'VIG': 'bg-green-500',
      'Verpleegkundige MBO': 'bg-cyan-500',
      'Helpende': 'bg-amber-500',
      'Begeleider': 'bg-purple-500',
      'Persoonlijk begeleider': 'bg-indigo-500',
      'GGZ-agoog': 'bg-rose-500',
    };
    return colors[functie || ''] || 'bg-muted-foreground';
  };

  const sizeClasses = {
    sm: {
      avatar: 'h-8 w-8',
      text: 'text-xs',
      statusDot: 'h-2 w-2 -bottom-0.5 -right-0.5',
      ring: 'ring-1',
    },
    md: {
      avatar: 'h-10 w-10',
      text: 'text-sm',
      statusDot: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
      ring: 'ring-2',
    },
    lg: {
      avatar: 'h-12 w-12',
      text: 'text-base',
      statusDot: 'h-3 w-3 -bottom-0.5 -right-0.5',
      ring: 'ring-2',
    },
    xl: {
      avatar: 'h-16 w-16',
      text: 'text-lg',
      statusDot: 'h-3.5 w-3.5 -bottom-1 -right-1',
      ring: 'ring-2',
    },
  };

  const config = sizeClasses[size];

  return (
    <div className={cn("relative inline-flex", className)}>
      <Avatar className={cn(
        config.avatar,
        TRANSITIONS.shadow,
        "ring-background",
        config.ring
      )}>
        {photoUrl && (
          <AvatarImage 
            src={photoUrl} 
            alt={name}
            className="object-cover"
          />
        )}
        <AvatarFallback className={cn(
          getFunctieColor(functieNiveau),
          "text-white font-medium",
          config.text
        )}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      
      {/* Status dot - Apple style */}
      {showStatus && status && (
        <span 
          className={cn(
            "absolute rounded-full ring-2 ring-background",
            config.statusDot,
            getStatusColor(status)
          )}
          title={status}
        />
      )}
    </div>
  );
}

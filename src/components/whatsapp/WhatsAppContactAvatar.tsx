import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WhatsAppContactAvatarProps {
  contactId?: string;
  profilePictureUrl?: string | null;
  displayName?: string | null;
  pushName?: string | null;
  phoneNumber: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showOnlineStatus?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
} as const;

const AVATAR_COLORS = [
  { bg: 'bg-red-100', text: 'text-red-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
] as const;

function getInitials(
  displayName: string | null | undefined,
  pushName: string | null | undefined,
  phoneNumber: string
): string {
  const name = displayName || pushName;
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  // Fallback: laatste 2 cijfers telefoonnummer
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.slice(-2) || '?';
}

function hashToColor(str: string): typeof AVATAR_COLORS[number] {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function WhatsAppContactAvatar({
  profilePictureUrl,
  displayName,
  pushName,
  phoneNumber,
  size = 'md',
  className,
}: WhatsAppContactAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const initials = getInitials(displayName, pushName, phoneNumber);
  const colorScheme = hashToColor(displayName || pushName || phoneNumber);
  const sizeClasses = SIZE_MAP[size];

  const showImage = profilePictureUrl && !imageError;

  return (
    <Avatar className={cn(sizeClasses, "border-2 border-border flex-shrink-0 relative", className)}>
      {showImage ? (
        <>
          {imageLoading && (
            <Skeleton className="absolute inset-0 rounded-full" />
          )}
          <AvatarImage
            src={profilePictureUrl}
            alt={displayName || pushName || phoneNumber}
            onLoad={() => setImageLoading(false)}
            onError={() => setImageError(true)}
            className={cn(
              "transition-opacity duration-200",
              imageLoading && "opacity-0"
            )}
          />
        </>
      ) : (
        <AvatarFallback className={cn(colorScheme.bg, colorScheme.text, "font-medium")}>
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

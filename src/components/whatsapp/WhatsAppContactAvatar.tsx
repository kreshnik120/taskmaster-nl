import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppContactAvatarProps {
  contactId?: string;
  profilePictureUrl?: string | null;
  displayName?: string | null;
  pushName?: string | null;
  phoneNumber: string;
  lastActiveAt?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showOnlineStatus?: boolean;
  isGroup?: boolean;
  className?: string;
}

// Online threshold: 5 minutes
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false;
  const lastActive = new Date(lastActiveAt).getTime();
  const now = Date.now();
  return (now - lastActive) < ONLINE_THRESHOLD_MS;
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

const ONLINE_DOT_SIZE = {
  sm: 'h-2 w-2 border',
  md: 'h-2.5 w-2.5 border-[1.5px]',
  lg: 'h-3 w-3 border-2',
  xl: 'h-4 w-4 border-2',
} as const;

export function WhatsAppContactAvatar({
  profilePictureUrl,
  displayName,
  pushName,
  phoneNumber,
  lastActiveAt,
  size = 'md',
  showOnlineStatus = false,
  isGroup = false,
  className,
}: WhatsAppContactAvatarProps) {
  const online = showOnlineStatus && !isGroup && isOnline(lastActiveAt);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const initials = getInitials(displayName, pushName, phoneNumber);
  const colorScheme = hashToColor(displayName || pushName || phoneNumber);
  const sizeClasses = SIZE_MAP[size];

  const showImage = profilePictureUrl && !imageError;

  return (
    <div className="relative flex-shrink-0">
      <Avatar className={cn(sizeClasses, "border-2 border-border", className)}>
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
        ) : isGroup ? (
          <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <Users className={cn(
              size === 'sm' && "h-4 w-4",
              size === 'md' && "h-5 w-5",
              size === 'lg' && "h-7 w-7",
              size === 'xl' && "h-10 w-10"
            )} />
          </AvatarFallback>
        ) : (
          <AvatarFallback className={cn(colorScheme.bg, colorScheme.text, "font-medium")}>
            {initials}
          </AvatarFallback>
        )}
      </Avatar>
      
      {/* Online status indicator */}
      {online && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 rounded-full bg-[#25D366] border-background",
            ONLINE_DOT_SIZE[size]
          )}
          aria-label="Online"
        />
      )}
    </div>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolves application candidate name with smart fallbacks
 * Priority: naam → full_name (excluding placeholders) → email prefix → fallback
 */
export function resolveApplicationName(application: {
  extracted_data?: { naam?: string; full_name?: string } | null;
  email_from: string;
}): string {
  // Check extracted_data.naam
  if (application.extracted_data?.naam?.trim()) {
    return application.extracted_data.naam.trim();
  }
  
  // Check full_name (exclude placeholder values)
  const fullName = application.extracted_data?.full_name?.trim();
  if (fullName && 
      !fullName.toLowerCase().includes('voor- en achternaam') &&
      !fullName.toLowerCase().includes('voornaam') &&
      !fullName.toLowerCase().includes('unknown')) {
    return fullName;
  }
  
  // Extract from email (k.atashi@... → "K. Atashi")
  const emailPrefix = application.email_from?.split('@')[0];
  if (emailPrefix) {
    return emailPrefix
      .split(/[._-]/)
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
  
  return 'Onbekende kandidaat';
}

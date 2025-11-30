// Dynamic organization mapping utility
// This replaces hard-coded UUID mappings throughout the app

export const ORG_NAMES: Record<string, string> = {
  "550e8400-e29b-41d4-a716-446655440000": "ABCzorg",
  "650e8400-e29b-41d4-a716-446655440001": "CitoZorg",
};

export function getOrganizationName(orgId: string | null): string {
  if (!orgId) return "Niet toegewezen";
  return ORG_NAMES[orgId] || "Onbekend";
}

export function getOrganizationBadgeColor(orgName: string): string {
  switch (orgName) {
    case "ABCzorg":
      return "border-blue-300 text-blue-700";
    case "CitoZorg":
      return "border-green-300 text-green-700";
    default:
      return "border-gray-300 text-gray-600";
  }
}

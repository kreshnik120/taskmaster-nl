import { supabase } from "@/integrations/supabase/client";

/**
 * Check if a professional already has an active placement at a sublocation
 * @returns { exists: boolean, placementId?: string }
 */
export async function checkExistingActivePlacement(
  professionalId: string,
  sublocationId: string
): Promise<{ exists: boolean; placementId?: string }> {
  const { data, error } = await supabase
    .from("assignments")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("sublocation_id", sublocationId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("Error checking existing placement:", error);
    return { exists: false };
  }

  return {
    exists: !!data,
    placementId: data?.id
  };
}

/**
 * Get all active placements for a professional
 * @returns Array of sublocation IDs where professional is actively placed
 */
export async function getActivePlacementSublocationIds(
  professionalId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("sublocation_id")
    .eq("professional_id", professionalId)
    .eq("status", "active");

  if (error) {
    console.error("Error fetching active placements:", error);
    return [];
  }

  return data?.map(d => d.sublocation_id) || [];
}

interface Toewijzing {
  status: string;
  positie_nr: number;
}

export function berekenBezetting(
  toewijzingen: Toewijzing[] | undefined | null,
  gevraagdAantal: number
): { bezet: number; pct: number } {
  const actief = (toewijzingen ?? []).filter((t) =>
    ["bevestigd", "positief"].includes(t.status)
  );
  const bezet =
    gevraagdAantal > 1
      ? new Set(actief.map((t) => t.positie_nr)).size
      : actief.length;
  const pct = Math.min(Math.round((bezet / Math.max(gevraagdAantal, 1)) * 100), 100);
  return { bezet, pct };
}

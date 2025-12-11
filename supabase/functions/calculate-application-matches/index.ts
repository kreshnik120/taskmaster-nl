/**
 * CALCULATE APPLICATION MATCHES
 * 
 * Automatically calculates match scores between an application and all active sublocations.
 * Triggered by database trigger when extracted_data is updated.
 * 
 * Stores top matches in application_sublocation_matches table for fast retrieval.
 */

import { 
  corsHeaders, 
  handleCors, 
  createAdminClient, 
  jsonResponse, 
  errorResponse,
  logInfo,
  logSuccess,
  logError,
  parseRequestBody
} from '../_shared/core.ts';

// ============= MATCHING CONSTANTS (Server-side copy of frontend logic) =============

const SECTOR_SIMILARITY: Record<string, Record<string, number>> = {
  'GHZ': { 'GGZ': 0.6, 'VVT': 0.3, 'Jeugdzorg': 0.6, 'Thuiszorg': 0.2 },
  'GGZ': { 'GHZ': 0.6, 'VVT': 0.4, 'Jeugdzorg': 0.5, 'Thuiszorg': 0.3 },
  'VVT': { 'GHZ': 0.3, 'GGZ': 0.4, 'Jeugdzorg': 0.3, 'Thuiszorg': 0.7 },
  'Jeugdzorg': { 'GHZ': 0.6, 'GGZ': 0.5, 'VVT': 0.3, 'Thuiszorg': 0.3 },
  'Thuiszorg': { 'GHZ': 0.2, 'GGZ': 0.3, 'VVT': 0.7, 'Jeugdzorg': 0.3 },
  'Ziekenhuis': { 'VVT': 0.5, 'GGZ': 0.4, 'Thuiszorg': 0.4 },
};

const FUNCTIE_HIERARCHY: Record<string, number> = {
  'HBO-V': 5,
  'Verpleegkundige MBO': 4,
  'VP4': 4,
  'VP3': 3,
  'VIG': 3,
  'GGZ-agoog': 4,
  'Persoonlijk begeleider': 3,
  'Begeleider': 2,
  'Helpende': 1,
  'Helpende 2': 1,
};

const DOELGROEP_RELATIONS: Record<string, string[]> = {
  'LVB': ['GHZ', 'Jeugdzorg', 'Psychiatrie'],
  'Psychiatrie': ['GGZ', 'LVB', 'Verslaving'],
  'Ouderen': ['VVT', 'Somatiek', 'Dementie'],
  'Somatiek': ['VVT', 'Ouderen', 'Thuiszorg'],
  'Verslaving': ['GGZ', 'Psychiatrie'],
  'Kinderen/Jeugd': ['Jeugdzorg', 'LVB'],
  'Dementie': ['VVT', 'Ouderen'],
};

// ============= MATCHING LOGIC =============

interface MatchCandidate {
  functie_niveau: string | null;
  regio: string | null;
  woonplaats?: string | null;
  postcode?: string | null;
  provincie?: string | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  jaren_ervaring?: number | null;
  eigen_vervoer?: boolean | null;
  certificaten?: string[] | null;
  werkvorm?: string | null;
}

interface MatchTarget {
  gezochte_functies?: string[] | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  plaats?: string | null;
  provincie?: string | null;
  postcode?: string | null;
  publieke_opmerking?: string | null;
}

interface MatchResult {
  sublocation_id: string;
  match_score: number;
  match_reasoning: {
    functieMatch: number;
    regioMatch: number;
    sectorMatch: number;
    doelgroepMatch: number;
    totalScore: number;
    reasoning: string[];
    details: Record<string, unknown>;
  };
}

function getExtractedValue<T>(field: T | { value: T; confidence: number } | null | undefined): T | null {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value: T; confidence: number }).value;
  }
  return field as T;
}

function calculateFunctieMatch(candidate: MatchCandidate, target: MatchTarget): { score: number; reasoning: string } {
  if (!candidate.functie_niveau || !target.gezochte_functies?.length) {
    return { score: 0, reasoning: 'Geen functieniveau of gezochte functies' };
  }

  const candidateLevel = FUNCTIE_HIERARCHY[candidate.functie_niveau] || 0;
  
  for (const gezocht of target.gezochte_functies) {
    const targetLevel = FUNCTIE_HIERARCHY[gezocht] || 0;
    
    // Exact match
    if (candidate.functie_niveau === gezocht) {
      return { score: 25, reasoning: `✅ Exacte functie match: ${gezocht}` };
    }
    
    // Can work at lower level
    if (candidateLevel >= targetLevel && targetLevel > 0) {
      return { score: 20, reasoning: `✅ Kan werken als ${gezocht} (hoger niveau)` };
    }
  }
  
  return { score: 5, reasoning: `⚠️ Functie ${candidate.functie_niveau} past niet direct bij gezochte functies` };
}

function calculateRegioMatch(candidate: MatchCandidate, target: MatchTarget): { score: number; reasoning: string } {
  if (!candidate.regio && !candidate.woonplaats && !candidate.postcode) {
    return { score: 5, reasoning: 'Geen locatie bekend' };
  }
  
  const candidateLocation = (candidate.regio || candidate.woonplaats || '').toLowerCase();
  const targetLocation = (target.plaats || '').toLowerCase();
  const targetProvincie = (target.provincie || '').toLowerCase();
  
  // Exact city match
  if (candidateLocation && targetLocation && candidateLocation.includes(targetLocation)) {
    return { score: 20, reasoning: `✅ Woont in ${target.plaats}` };
  }
  
  // Same province
  if (candidate.provincie && targetProvincie && 
      candidate.provincie.toLowerCase() === targetProvincie) {
    return { score: 15, reasoning: `✅ Zelfde provincie: ${target.provincie}` };
  }
  
  // Neighboring region check (simplified)
  if (candidateLocation && targetLocation) {
    return { score: 10, reasoning: `⚠️ Regio ${candidate.regio || candidate.woonplaats} nabij ${target.plaats}` };
  }
  
  return { score: 5, reasoning: 'Locatie onbekend of ver weg' };
}

function calculateSectorMatch(candidate: MatchCandidate, target: MatchTarget): { score: number; reasoning: string } {
  if (!candidate.ervaring_sector?.length || !target.sector?.length) {
    return { score: 5, reasoning: 'Geen sector informatie' };
  }
  
  let bestScore = 0;
  let bestReason = '';
  
  for (const candidateSector of candidate.ervaring_sector) {
    for (const targetSector of target.sector) {
      // Exact match
      if (candidateSector.toLowerCase() === targetSector.toLowerCase()) {
        return { score: 20, reasoning: `✅ Ervaring in ${targetSector}` };
      }
      
      // Similarity check
      const similarity = SECTOR_SIMILARITY[candidateSector]?.[targetSector] || 0;
      if (similarity > 0.5) {
        const partialScore = Math.round(20 * similarity);
        if (partialScore > bestScore) {
          bestScore = partialScore;
          bestReason = `⚠️ Gerelateerde sector: ${candidateSector} → ${targetSector} (${Math.round(similarity * 100)}%)`;
        }
      }
    }
  }
  
  if (bestScore > 0) {
    return { score: bestScore, reasoning: bestReason };
  }
  
  return { score: 5, reasoning: `Sector ${candidate.ervaring_sector.join(', ')} niet direct gerelateerd` };
}

function calculateDoelgroepMatch(candidate: MatchCandidate, target: MatchTarget): { score: number; reasoning: string } {
  if (!candidate.doelgroep_ervaring?.length || !target.doelgroep?.length) {
    return { score: 3, reasoning: 'Geen doelgroep informatie' };
  }
  
  for (const candidateDg of candidate.doelgroep_ervaring) {
    for (const targetDg of target.doelgroep) {
      if (candidateDg.toLowerCase() === targetDg.toLowerCase()) {
        return { score: 15, reasoning: `✅ Ervaring met ${targetDg}` };
      }
      
      // Check related doelgroepen
      const related = DOELGROEP_RELATIONS[candidateDg] || [];
      if (related.some(r => r.toLowerCase() === targetDg.toLowerCase())) {
        return { score: 10, reasoning: `⚠️ Gerelateerde ervaring: ${candidateDg} → ${targetDg}` };
      }
    }
  }
  
  return { score: 3, reasoning: `Doelgroep ${candidate.doelgroep_ervaring.join(', ')} niet direct match` };
}

function calculateMatchScore(candidate: MatchCandidate, target: MatchTarget): MatchResult['match_reasoning'] {
  const functie = calculateFunctieMatch(candidate, target);
  const regio = calculateRegioMatch(candidate, target);
  const sector = calculateSectorMatch(candidate, target);
  const doelgroep = calculateDoelgroepMatch(candidate, target);
  
  const totalScore = functie.score + regio.score + sector.score + doelgroep.score;
  
  // Max possible = 25 + 20 + 20 + 15 = 80
  // Normalize to 100
  const normalizedScore = Math.min(100, Math.round((totalScore / 80) * 100));
  
  return {
    functieMatch: functie.score,
    regioMatch: regio.score,
    sectorMatch: sector.score,
    doelgroepMatch: doelgroep.score,
    totalScore: normalizedScore,
    reasoning: [functie.reasoning, regio.reasoning, sector.reasoning, doelgroep.reasoning],
    details: {
      candidate_functie: candidate.functie_niveau,
      candidate_regio: candidate.regio || candidate.woonplaats,
      candidate_sector: candidate.ervaring_sector,
      candidate_doelgroep: candidate.doelgroep_ervaring,
      target_functies: target.gezochte_functies,
      target_sector: target.sector,
      target_doelgroep: target.doelgroep,
    }
  };
}

// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const body = await parseRequestBody<{ application_id: string }>(req);
    const { application_id } = body;

    if (!application_id) {
      return errorResponse('application_id is required', 400);
    }

    logInfo('CalculateMatches', 'Starting match calculation', { application_id });

    const supabase = createAdminClient();

    // 1. Fetch application with extracted_data
    const { data: application, error: appError } = await supabase
      .from('professional_applications')
      .select('id, extracted_data, org_id, completeness_score')
      .eq('id', application_id)
      .single();

    if (appError || !application) {
      return errorResponse(`Application not found: ${appError?.message}`, 404);
    }

    const extractedData = application.extracted_data || {};
    
    // Map to MatchCandidate
    const candidate: MatchCandidate = {
      functie_niveau: getExtractedValue(extractedData.functie_niveau),
      regio: getExtractedValue(extractedData.regio),
      woonplaats: getExtractedValue(extractedData.woonplaats),
      postcode: getExtractedValue(extractedData.postcode),
      provincie: getExtractedValue(extractedData.provincie),
      ervaring_sector: getExtractedValue(extractedData.ervaring_sector) || [],
      doelgroep_ervaring: getExtractedValue(extractedData.doelgroep_ervaring) || 
                          getExtractedValue(extractedData.specifieke_doelgroepen) || [],
      jaren_ervaring: getExtractedValue(extractedData.jaren_ervaring),
      eigen_vervoer: getExtractedValue(extractedData.eigen_vervoer),
      certificaten: getExtractedValue(extractedData.certificaten) || [],
      werkvorm: getExtractedValue(extractedData.werkvorm),
    };

    logInfo('CalculateMatches', 'Candidate profile', { candidate });

    // 2. Fetch all active sublocations
    const { data: sublocations, error: subError } = await supabase
      .from('client_sublocations')
      .select(`
        id, naam, plaats, sector, doelgroep, gezochte_functies, provincie, postcode, publieke_opmerking,
        location:client_locations(naam, client_org:client_organizations(name))
      `)
      .eq('is_active', true);

    if (subError) {
      return errorResponse(`Failed to fetch sublocations: ${subError.message}`, 500);
    }

    logInfo('CalculateMatches', `Found ${sublocations?.length || 0} active sublocations`);

    // 3. Calculate match scores for each sublocation
    const matches: MatchResult[] = [];
    
    for (const sub of sublocations || []) {
      const target: MatchTarget = {
        gezochte_functies: sub.gezochte_functies,
        sector: sub.sector,
        doelgroep: sub.doelgroep,
        plaats: sub.plaats,
        provincie: sub.provincie,
        postcode: sub.postcode,
        publieke_opmerking: sub.publieke_opmerking,
      };

      const reasoning = calculateMatchScore(candidate, target);
      
      // Only include matches above threshold (30% for incomplete profiles)
      if (reasoning.totalScore >= 30) {
        matches.push({
          sublocation_id: sub.id,
          match_score: reasoning.totalScore,
          match_reasoning: reasoning,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    // Take top 20
    const topMatches = matches.slice(0, 20);

    logInfo('CalculateMatches', `Found ${matches.length} matches above 30%, storing top ${topMatches.length}`);

    // 4. Store matches (upsert to avoid duplicates)
    for (const match of topMatches) {
      // Check if match already exists
      const { data: existing } = await supabase
        .from('application_sublocation_matches')
        .select('id, status')
        .eq('application_id', application_id)
        .eq('sublocation_id', match.sublocation_id)
        .maybeSingle();

      if (existing) {
        // Update existing match (but preserve status if already voorgesteld)
        if (existing.status === 'potentieel') {
          await supabase
            .from('application_sublocation_matches')
            .update({
              match_score: match.match_score,
              match_reasoning: match.match_reasoning,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        }
      } else {
        // Insert new match
        await supabase
          .from('application_sublocation_matches')
          .insert({
            application_id,
            sublocation_id: match.sublocation_id,
            match_score: match.match_score,
            match_reasoning: match.match_reasoning,
            status: 'potentieel',
          });
      }
    }

    // 5. Clean up old low-score matches that are still 'potentieel'
    const topSublocationIds = topMatches.map(m => m.sublocation_id);
    
    if (topSublocationIds.length > 0) {
      await supabase
        .from('application_sublocation_matches')
        .delete()
        .eq('application_id', application_id)
        .eq('status', 'potentieel')
        .not('sublocation_id', 'in', `(${topSublocationIds.join(',')})`);
    }

    logSuccess('CalculateMatches', 'Match calculation complete', {
      application_id,
      total_matches: matches.length,
      stored_matches: topMatches.length,
      top_score: topMatches[0]?.match_score || 0,
    });

    return jsonResponse({
      success: true,
      application_id,
      matches_found: matches.length,
      matches_stored: topMatches.length,
      top_matches: topMatches.slice(0, 5).map(m => ({
        sublocation_id: m.sublocation_id,
        score: m.match_score,
      })),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('CalculateMatches', 'Unexpected error', error);
    return errorResponse(`Unexpected error: ${errorMessage}`, 500);
  }
});

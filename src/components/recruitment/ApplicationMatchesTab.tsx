import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Building2, MapPin, Users, Briefcase, Link2, Clock, Sparkles, CheckCircle2, AlertCircle, Brain, Info, X, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateApplicationMatchScoreWithExperts, preloadExpertKnowledge, type MatchScoreBreakdown } from "@/lib/services/matchingService";
import { MatchScoreBreakdown as MatchScoreBreakdownUI } from "./MatchScoreBreakdown";
import { loadSuccessPatterns, calculateAILearningBoost, trackPatternUsage, type SuccessPattern } from "@/lib/aiLearningBoost";
import confetti from "canvas-confetti";

interface ApplicationMatchesTabProps {
  application: {
    id: string;
    extracted_data: any;
    completeness_score: number | null;
    professional_id: string | null;
  };
  onApplicationUpdated: () => void;
}

interface MatchedSublocation {
  id: string;
  naam: string;
  plaats: string | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
  matchScore: number;
  matchBreakdown: MatchScoreBreakdown;
  organization_name: string;
  location_name: string;
  existingMatch?: { id: string; status: string };
  aiBoost?: number;
  aiReasons?: string[];
}

interface MatchedVacancy {
  id: string;
  titel: string;
  functie_niveau: string;
  sublocation_naam: string;
  organization_name: string;
  plaats: string | null;
  urgentie: string;
  uren_per_week: number | null;
  matchScore: number;
  matchBreakdown: MatchScoreBreakdown;
  existingApplication?: { id: string; status: string };
  aiBoost?: number;
  aiReasons?: string[];
}

// Helper to get value from {value, confidence} or plain value
const getFieldValue = <T,>(field: T | { value: T; confidence: number } | null | undefined): T | null => {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value: T; confidence: number }).value;
  }
  return field as T;
};

const getScoreColor = (score: number) => {
  if (score >= 70) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

const getProgressColor = (score: number) => {
  if (score >= 70) return "[&>div]:bg-green-500";
  if (score >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
};

export function ApplicationMatchesTab({ application, onApplicationUpdated }: ApplicationMatchesTabProps) {
  const [loading, setLoading] = useState(true);
  const [matchedSublocations, setMatchedSublocations] = useState<MatchedSublocation[]>([]);
  const [matchedVacancies, setMatchedVacancies] = useState<MatchedVacancy[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [totalAIBoost, setTotalAIBoost] = useState(0);
  const [aiPatternsLoaded, setAiPatternsLoaded] = useState(0);
  
  // Multi-select state
  const [selectedSublocations, setSelectedSublocations] = useState<Set<string>>(new Set());
  const [selectedVacancies, setSelectedVacancies] = useState<Set<string>>(new Set());
  const [bulkLinking, setBulkLinking] = useState(false);

  const completenessScore = application.completeness_score || 0;
  const canMatch = completenessScore >= 50;

  useEffect(() => {
    if (canMatch) {
      calculateMatches();
    } else {
      setLoading(false);
    }
  }, [application.id, application.extracted_data]);

  const calculateMatches = async () => {
    setLoading(true);
    try {
      const data = application.extracted_data || {};

      // === FIX 1: Preload expert knowledge for expert advice in matching ===
      const expertCount = await preloadExpertKnowledge();
      console.log(`[ApplicationMatchesTab] Loaded ${expertCount} expert specialisms`);

      // === FASE 1 & 4: Load AI success patterns for boost ===
      const aiPatterns = await loadSuccessPatterns();
      setAiPatternsLoaded(aiPatterns.length);

      // Extract applicant data for AI boost calculation
      const applicantFunctie = getFieldValue(data.functie_niveau) as string | null;
      const applicantSectoren = (getFieldValue(data.ervaring_sector) as string[]) || [];
      const applicantDoelgroepen = (getFieldValue(data.doelgroep_ervaring) as string[]) || [];
      const applicantWerkvorm = getFieldValue(data.werkvorm) as string | null;
      // Fetch active sublocations with their organization info and publieke_opmerking
      const { data: sublocations, error: subError } = await supabase
        .from('client_sublocations')
        .select(`
          id, naam, plaats, sector, doelgroep, gezochte_functies, provincie, postcode, publieke_opmerking,
          location:client_locations!inner(
            naam,
            client_org:client_organizations!inner(name)
          )
        `)
        .eq('is_active', true)
        .limit(200);

      if (subError) throw subError;

      // Fetch existing matches for this application
      const { data: existingMatches } = await supabase
        .from('application_sublocation_matches')
        .select('id, sublocation_id, status')
        .eq('application_id', application.id);

      const existingMatchMap = new Map(existingMatches?.map(m => [m.sublocation_id, m]) || []);

      // Track all used pattern IDs for usage updates
      const allUsedPatternIds: string[] = [];
      let maxAIBoost = 0;

      // Calculate match scores with AI boost integrated (ASYNC for expert knowledge)
      const scoredSublocationsPromises = (sublocations || []).map(async (sub) => {
        const target = {
          gezochte_functies: sub.gezochte_functies,
          sector: sub.sector,
          doelgroep: sub.doelgroep,
          plaats: sub.plaats,
          provincie: sub.provincie,
          postcode: sub.postcode,
          publieke_opmerking: sub.publieke_opmerking,
        };

        // Calculate AI boost FIRST
        const aiBoostResult = calculateAILearningBoost(
          applicantFunctie,
          applicantSectoren,
          applicantDoelgroepen,
          aiPatterns,
          sub.gezochte_functies?.[0] || null,
          sub.sector || [],
          sub.doelgroep || []
        );

        // Track used patterns
        if (aiBoostResult.usedPatternIds.length > 0) {
          allUsedPatternIds.push(...aiBoostResult.usedPatternIds);
        }
        if (aiBoostResult.boost > maxAIBoost) {
          maxAIBoost = aiBoostResult.boost;
        }

        // === FIX: Use async calculateApplicationMatchScoreWithExperts for Expert Panel ===
        const matchBreakdown = await calculateApplicationMatchScoreWithExperts(application, target, {
          boost: aiBoostResult.boost,
          reasons: aiBoostResult.reasons,
          usedPatternIds: aiBoostResult.usedPatternIds
        });

        return {
          id: sub.id,
          naam: sub.naam,
          plaats: sub.plaats,
          sector: sub.sector,
          doelgroep: sub.doelgroep,
          gezochte_functies: sub.gezochte_functies,
          matchScore: matchBreakdown.normalizedScore,
          matchBreakdown,
          organization_name: (sub.location as any)?.client_org?.name || 'Onbekend',
          location_name: (sub.location as any)?.naam || 'Onbekend',
          existingMatch: existingMatchMap.get(sub.id),
          aiBoost: matchBreakdown.aiBoost,
          aiReasons: matchBreakdown.aiBoostReasons,
        };
      });

      // Await all sublocation calculations
      const scoredSublocationsRaw = await Promise.all(scoredSublocationsPromises);
      const scoredSublocations = scoredSublocationsRaw
        .filter(sub => sub.matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      setMatchedSublocations(scoredSublocations);

      // Fetch open vacancies
      const { data: vacancies, error: vacError } = await supabase
        .from('vacancies')
        .select(`
          id, titel, functie_niveau, urgentie, uren_per_week, status,
          sublocation:client_sublocations(
            naam, plaats, sector, doelgroep, gezochte_functies, provincie,
            location:client_locations(
              naam,
              client_org:client_organizations(name)
            )
          )
        `)
        .eq('status', 'open')
        .limit(100);

      if (vacError) throw vacError;

      // Fetch existing vacancy applications
      const { data: existingVacApps } = await supabase
        .from('vacancy_applications')
        .select('id, vacancy_id, status')
        .eq('application_id', application.id);

      const existingVacMap = new Map(existingVacApps?.map(v => [v.vacancy_id, v]) || []);

      // Calculate vacancy match scores with AI boost integrated (ASYNC for expert knowledge)
      const scoredVacanciesPromises = (vacancies || [])
        .filter(vac => vac.sublocation)
        .map(async (vac) => {
          const sub = vac.sublocation as any;
          const target = {
            gezochte_functies: [vac.functie_niveau, ...(sub?.gezochte_functies || [])],
            sector: sub?.sector,
            doelgroep: sub?.doelgroep,
            plaats: sub?.plaats,
            provincie: sub?.provincie,
          };

          const aiBoostResult = calculateAILearningBoost(
            applicantFunctie,
            applicantSectoren,
            applicantDoelgroepen,
            aiPatterns,
            vac.functie_niveau,
            sub?.sector || [],
            sub?.doelgroep || []
          );

          if (aiBoostResult.usedPatternIds.length > 0) {
            allUsedPatternIds.push(...aiBoostResult.usedPatternIds);
          }
          if (aiBoostResult.boost > maxAIBoost) {
            maxAIBoost = aiBoostResult.boost;
          }

          // === FIX: Use async calculateApplicationMatchScoreWithExperts for Expert Panel ===
          const matchBreakdown = await calculateApplicationMatchScoreWithExperts(application, target, {
            boost: aiBoostResult.boost,
            reasons: aiBoostResult.reasons,
            usedPatternIds: aiBoostResult.usedPatternIds
          });

          return {
            id: vac.id,
            titel: vac.titel,
            functie_niveau: vac.functie_niveau,
            sublocation_naam: sub?.naam || 'Onbekend',
            organization_name: sub?.location?.client_org?.name || 'Onbekend',
            plaats: sub?.plaats,
            urgentie: vac.urgentie,
            uren_per_week: vac.uren_per_week,
            matchScore: matchBreakdown.normalizedScore,
            matchBreakdown,
            existingApplication: existingVacMap.get(vac.id),
            aiBoost: matchBreakdown.aiBoost,
            aiReasons: matchBreakdown.aiBoostReasons,
          };
        });

      // Await all vacancy calculations
      const scoredVacanciesRaw = await Promise.all(scoredVacanciesPromises);
      const scoredVacancies = scoredVacanciesRaw
        .filter(vac => vac.matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      setMatchedVacancies(scoredVacancies);
      setTotalAIBoost(maxAIBoost);

      // Track pattern usage for AI learning
      const uniquePatternIds = [...new Set(allUsedPatternIds)];
      if (uniquePatternIds.length > 0) {
        trackPatternUsage(uniquePatternIds);
      }

    } catch (error) {
      console.error('Error calculating matches:', error);
      toast.error('Kon matches niet berekenen');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkToSublocation = async (sublocation: MatchedSublocation) => {
    setLinking(sublocation.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('application_sublocation_matches')
        .insert({
          application_id: application.id,
          sublocation_id: sublocation.id,
          match_score: sublocation.matchScore,
          match_reasoning: {
            ...sublocation.matchBreakdown,
            aiBoost: sublocation.aiBoost,
            aiReasons: sublocation.aiReasons,
          } as any,
          status: 'voorgesteld',
          created_by: user?.id,
        } as any);

      if (error) throw error;

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Gekoppeld aan ${sublocation.naam}`, {
        description: `Match score: ${sublocation.matchScore}%${sublocation.aiBoost ? ` (+${sublocation.aiBoost}% AI)` : ''}`
      });

      await calculateMatches();
      onApplicationUpdated();
    } catch (error: any) {
      console.error('Error linking to sublocation:', error);
      toast.error('Kon niet koppelen', { description: error.message });
    } finally {
      setLinking(null);
    }
  };

  const handleLinkToVacancy = async (vacancy: MatchedVacancy) => {
    setLinking(vacancy.id);
    try {
      const { error } = await supabase
        .from('vacancy_applications')
        .insert({
          vacancy_id: vacancy.id,
          application_id: application.id,
          professional_id: application.professional_id,
          status: 'voorgesteld',
          match_score: vacancy.matchScore,
          match_reasoning: { 
            score: vacancy.matchScore, 
            breakdown: vacancy.matchBreakdown,
            aiBoost: vacancy.aiBoost,
            aiReasons: vacancy.aiReasons,
          },
        } as any);

      if (error) throw error;

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Gekoppeld aan vacature: ${vacancy.titel}`, {
        description: `Match score: ${vacancy.matchScore}%${vacancy.aiBoost ? ` (+${vacancy.aiBoost}% AI)` : ''}`
      });

      await calculateMatches();
      onApplicationUpdated();
    } catch (error: any) {
      console.error('Error linking to vacancy:', error);
      toast.error('Kon niet koppelen', { description: error.message });
    } finally {
      setLinking(null);
    }
  };

  // Multi-select toggle functions
  const toggleSublocationSelection = (id: string) => {
    setSelectedSublocations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVacancySelection = (id: string) => {
    setSelectedVacancies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSublocations = () => {
    const linkableIds = matchedSublocations
      .filter(s => !s.existingMatch)
      .map(s => s.id);
    setSelectedSublocations(new Set(linkableIds));
  };

  const selectAllVacancies = () => {
    const linkableIds = matchedVacancies
      .filter(v => !v.existingApplication)
      .map(v => v.id);
    setSelectedVacancies(new Set(linkableIds));
  };

  const clearSelection = () => {
    setSelectedSublocations(new Set());
    setSelectedVacancies(new Set());
  };

  // Bulk link handlers
  const handleBulkLinkSublocations = async () => {
    if (selectedSublocations.size === 0) return;
    
    setBulkLinking(true);
    const toLink = matchedSublocations.filter(s => 
      selectedSublocations.has(s.id) && !s.existingMatch
    );

    let successCount = 0;
    for (const sublocation of toLink) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
          .from('application_sublocation_matches')
          .insert({
            application_id: application.id,
            sublocation_id: sublocation.id,
            match_score: sublocation.matchScore,
            match_reasoning: {
              ...sublocation.matchBreakdown,
              aiBoost: sublocation.aiBoost,
              aiReasons: sublocation.aiReasons,
            } as any,
            status: 'voorgesteld',
            created_by: user?.id,
          } as any);
        successCount++;
      } catch (error) {
        console.error(`Error linking ${sublocation.naam}:`, error);
      }
    }

    if (successCount > 0) {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 }
      });
      toast.success(`${successCount} locaties voorgesteld`, {
        description: 'Alle geselecteerde locaties zijn gekoppeld'
      });
    }

    setSelectedSublocations(new Set());
    setBulkLinking(false);
    await calculateMatches();
    onApplicationUpdated();
  };

  const handleBulkLinkVacancies = async () => {
    if (selectedVacancies.size === 0) return;
    
    setBulkLinking(true);
    const toLink = matchedVacancies.filter(v => 
      selectedVacancies.has(v.id) && !v.existingApplication
    );

    let successCount = 0;
    for (const vacancy of toLink) {
      try {
        await supabase
          .from('vacancy_applications')
          .insert({
            vacancy_id: vacancy.id,
            application_id: application.id,
            professional_id: application.professional_id,
            status: 'voorgesteld',
            match_score: vacancy.matchScore,
            match_reasoning: { 
              score: vacancy.matchScore, 
              breakdown: vacancy.matchBreakdown,
              aiBoost: vacancy.aiBoost,
              aiReasons: vacancy.aiReasons,
            },
          } as any);
        successCount++;
      } catch (error) {
        console.error(`Error linking ${vacancy.titel}:`, error);
      }
    }

    if (successCount > 0) {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 }
      });
      toast.success(`${successCount} vacatures gekoppeld`, {
        description: 'Alle geselecteerde vacatures zijn gekoppeld'
      });
    }

    setSelectedVacancies(new Set());
    setBulkLinking(false);
    await calculateMatches();
    onApplicationUpdated();
  };

  const totalSelected = selectedSublocations.size + selectedVacancies.size;

  if (!canMatch) {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Profiel niet compleet genoeg voor matching
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Het profiel moet minimaal 50% compleet zijn voor accurate matching. 
              Huidige compleetheid: <span className="font-semibold">{completenessScore}%</span>
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              💡 Tip: Vul de ontbrekende gegevens aan via het "Overzicht" tabblad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">AI-gedreven matches berekenen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* === FASE 3: AI Match Header with Boost Badge === */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-purple-500" />
          <span className="font-medium">AI-gedreven matching</span>
          <span className="text-muted-foreground">• Gebaseerd op {completenessScore}% profiel compleetheid</span>
        </div>
        {totalAIBoost > 0 && (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300">
            <Sparkles className="h-3 w-3 mr-1" />
            +{totalAIBoost}% AI boost actief
          </Badge>
        )}
      </div>

      {/* AI Patterns Info */}
      {aiPatternsLoaded > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span>{aiPatternsLoaded} geleerde patronen worden toegepast op matching</span>
        </div>
      )}

      {/* Matching Vacatures Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {matchedVacancies.filter(v => !v.existingApplication).length > 0 && (
              <Checkbox
                checked={selectedVacancies.size === matchedVacancies.filter(v => !v.existingApplication).length && selectedVacancies.size > 0}
                onCheckedChange={(checked) => checked ? selectAllVacancies() : setSelectedVacancies(new Set())}
                className="h-4 w-4"
              />
            )}
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Passende Vacatures
              {matchedVacancies.length > 0 && (
                <Badge variant="secondary" className="ml-1">{matchedVacancies.length}</Badge>
              )}
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={calculateMatches}>
            Ververs
          </Button>
        </div>

        {matchedVacancies.length > 0 ? (
          <div className="space-y-2">
            {matchedVacancies.slice(0, 5).map((vacancy) => (
              <div 
                key={vacancy.id}
                className={`p-3 rounded-lg border bg-card hover:shadow-sm transition-all ${
                  vacancy.aiBoost && vacancy.aiBoost > 0 ? 'ring-1 ring-purple-300/50' : ''
                } ${selectedVacancies.has(vacancy.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  {!vacancy.existingApplication && (
                    <Checkbox
                      checked={selectedVacancies.has(vacancy.id)}
                      onCheckedChange={() => toggleVacancySelection(vacancy.id)}
                      className="mt-1 h-4 w-4"
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{vacancy.titel}</span>
                      {vacancy.urgentie === 'hoog' && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>
                      )}
                      {vacancy.aiBoost && vacancy.aiBoost > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-300">
                          <Sparkles className="h-3 w-3 mr-1" />
                          +{vacancy.aiBoost}% AI
                        </Badge>
                      )}
                      {vacancy.existingApplication && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {vacancy.existingApplication.status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {vacancy.organization_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {vacancy.plaats || vacancy.sublocation_naam}
                      </span>
                      {vacancy.uren_per_week && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {vacancy.uren_per_week} uur/week
                        </span>
                      )}
                    </div>
                    {vacancy.aiReasons && vacancy.aiReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {vacancy.aiReasons.slice(0, 2).map((reason, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] bg-purple-50 text-purple-600">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right cursor-pointer hover:scale-105 transition-transform group">
                          <div className={`text-lg font-bold ${getScoreColor(vacancy.matchScore)}`}>
                            {vacancy.matchScore}%
                          </div>
                          <Progress 
                            value={vacancy.matchScore} 
                            className={`h-1.5 w-16 ${getProgressColor(vacancy.matchScore)}`}
                          />
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Info className="h-3 w-3" /> Details
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="end">
                        <MatchScoreBreakdownUI 
                          breakdown={vacancy.matchBreakdown}
                          totalScore={vacancy.matchScore}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    {!vacancy.existingApplication ? (
                      <Button
                        size="sm"
                        onClick={() => handleLinkToVacancy(vacancy)}
                        disabled={linking === vacancy.id || selectedVacancies.size > 0}
                      >
                        {linking === vacancy.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-1" />
                            Koppelen
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        Gekoppeld
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">Geen passende vacatures gevonden</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Matching Sublocaties Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {matchedSublocations.filter(s => !s.existingMatch).length > 0 && (
              <Checkbox
                checked={selectedSublocations.size === matchedSublocations.filter(s => !s.existingMatch).length && selectedSublocations.size > 0}
                onCheckedChange={(checked) => checked ? selectAllSublocations() : setSelectedSublocations(new Set())}
                className="h-4 w-4"
              />
            )}
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Passende Werklocaties
              {matchedSublocations.length > 0 && (
                <Badge variant="secondary" className="ml-1">{matchedSublocations.length}</Badge>
              )}
            </h3>
          </div>
        </div>

        {matchedSublocations.length > 0 ? (
          <div className="space-y-2">
            {matchedSublocations.slice(0, 5).map((sublocation) => (
              <div 
                key={sublocation.id}
                className={`p-3 rounded-lg border bg-card hover:shadow-sm transition-all ${
                  sublocation.aiBoost && sublocation.aiBoost > 0 ? 'ring-1 ring-purple-300/50' : ''
                } ${selectedSublocations.has(sublocation.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  {!sublocation.existingMatch && (
                    <Checkbox
                      checked={selectedSublocations.has(sublocation.id)}
                      onCheckedChange={() => toggleSublocationSelection(sublocation.id)}
                      className="mt-1 h-4 w-4"
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{sublocation.naam}</span>
                      {sublocation.aiBoost && sublocation.aiBoost > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-300">
                          <Sparkles className="h-3 w-3 mr-1" />
                          +{sublocation.aiBoost}% AI
                        </Badge>
                      )}
                      {sublocation.existingMatch && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {sublocation.existingMatch.status}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {sublocation.organization_name}
                      </span>
                      {sublocation.plaats && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {sublocation.plaats}
                        </span>
                      )}
                    </div>
                    {(sublocation.sector?.length || sublocation.doelgroep?.length) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sublocation.sector?.slice(0, 2).map((s, idx) => (
                          <Badge key={`s-${idx}`} variant="outline" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                        {sublocation.doelgroep?.slice(0, 2).map((d, idx) => (
                          <Badge key={`d-${idx}`} variant="secondary" className="text-[10px]">
                            {d}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {sublocation.aiReasons && sublocation.aiReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sublocation.aiReasons.slice(0, 2).map((reason, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] bg-purple-50 text-purple-600">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right cursor-pointer hover:scale-105 transition-transform group">
                          <div className={`text-lg font-bold ${getScoreColor(sublocation.matchScore)}`}>
                            {sublocation.matchScore}%
                          </div>
                          <Progress 
                            value={sublocation.matchScore} 
                            className={`h-1.5 w-16 ${getProgressColor(sublocation.matchScore)}`}
                          />
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Info className="h-3 w-3" /> Details
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0" align="end">
                        <MatchScoreBreakdownUI 
                          breakdown={sublocation.matchBreakdown}
                          totalScore={sublocation.matchScore}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    {!sublocation.existingMatch ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLinkToSublocation(sublocation)}
                        disabled={linking === sublocation.id || selectedSublocations.size > 0}
                      >
                        {linking === sublocation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-1" />
                            Voorstel
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Voorgesteld
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">Geen passende werklocaties gevonden</p>
            <p className="text-xs text-muted-foreground mt-1">
              💡 Tip: Zorg dat klanten regio's en sectoren hebben ingesteld
            </p>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {totalSelected > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 bg-background/95 backdrop-blur-lg border shadow-xl rounded-full px-5 py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{totalSelected} geselecteerd</span>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={clearSelection}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Deselecteer
            </Button>
            
            {selectedSublocations.size > 0 && (
              <Button 
                size="sm" 
                onClick={handleBulkLinkSublocations}
                disabled={bulkLinking}
                className="bg-primary hover:bg-primary/90"
              >
                {bulkLinking ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                Voorstel {selectedSublocations.size} locatie{selectedSublocations.size !== 1 ? 's' : ''}
              </Button>
            )}
            
            {selectedVacancies.size > 0 && (
              <Button 
                size="sm" 
                onClick={handleBulkLinkVacancies}
                disabled={bulkLinking}
                className="bg-primary hover:bg-primary/90"
              >
                {bulkLinking ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                Koppel {selectedVacancies.size} vacature{selectedVacancies.size !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

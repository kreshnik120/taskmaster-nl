import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, Building2, MapPin, Users, Briefcase, Link2, Clock, Sparkles, CheckCircle2, AlertCircle, Brain, Info, X, ListChecks, Filter, SlidersHorizontal } from "lucide-react";
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
  provincie?: string | null;
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

// === MEMOIZED SUBLOCATION CARD ===
const SublocationCard = memo(({ 
  sublocation, 
  isSelected,
  onToggleSelection,
  onLink,
  linking
}: {
  sublocation: MatchedSublocation;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onLink: (sub: MatchedSublocation) => void;
  linking: string | null;
}) => (
  <div 
    className={`p-3 rounded-lg border bg-card hover:shadow-sm transition-all ${
      sublocation.aiBoost && sublocation.aiBoost > 0 ? 'ring-1 ring-purple-300/50' : ''
    } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
  >
    <div className="flex items-start gap-3">
      {!sublocation.existingMatch && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(sublocation.id)}
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
            onClick={() => onLink(sublocation)}
            disabled={linking === sublocation.id}
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
          <Button size="sm" variant="outline" disabled>
            Voorgesteld
          </Button>
        )}
      </div>
    </div>
  </div>
));
SublocationCard.displayName = 'SublocationCard';

// === MEMOIZED VACANCY CARD ===
const VacancyCard = memo(({ 
  vacancy, 
  isSelected,
  onToggleSelection,
  onLink,
  linking
}: {
  vacancy: MatchedVacancy;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onLink: (vac: MatchedVacancy) => void;
  linking: string | null;
}) => (
  <div 
    className={`p-3 rounded-lg border bg-card hover:shadow-sm transition-all ${
      vacancy.aiBoost && vacancy.aiBoost > 0 ? 'ring-1 ring-purple-300/50' : ''
    } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
  >
    <div className="flex items-start gap-3">
      {!vacancy.existingApplication && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(vacancy.id)}
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
            onClick={() => onLink(vacancy)}
            disabled={linking === vacancy.id}
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
));
VacancyCard.displayName = 'VacancyCard';

export function ApplicationMatchesTab({ application, onApplicationUpdated }: ApplicationMatchesTabProps) {
  const [loading, setLoading] = useState(true);
  const [allMatchedSublocations, setAllMatchedSublocations] = useState<MatchedSublocation[]>([]);
  const [allMatchedVacancies, setAllMatchedVacancies] = useState<MatchedVacancy[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [totalAIBoost, setTotalAIBoost] = useState(0);
  const [aiPatternsLoaded, setAiPatternsLoaded] = useState(0);
  
  // === QUICK FILTERS STATE ===
  const [regioFilter, setRegioFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [minScoreFilter, setMinScoreFilter] = useState<number>(40);
  const [showFilters, setShowFilters] = useState(false);
  
  // Multi-select state
  const [selectedSublocations, setSelectedSublocations] = useState<Set<string>>(new Set());
  const [selectedVacancies, setSelectedVacancies] = useState<Set<string>>(new Set());
  const [bulkLinking, setBulkLinking] = useState(false);
  
  const completenessScore = application.completeness_score || 0;
  const canMatch = completenessScore >= 50;

  // === EXTRACT UNIQUE FILTER OPTIONS ===
  const uniqueRegios = useMemo(() => {
    const regios = new Set<string>();
    allMatchedSublocations.forEach(s => {
      if (s.plaats) regios.add(s.plaats);
      if (s.provincie) regios.add(s.provincie);
    });
    return Array.from(regios).sort();
  }, [allMatchedSublocations]);

  const uniqueSectors = useMemo(() => {
    const sectors = new Set<string>();
    allMatchedSublocations.forEach(s => {
      s.sector?.forEach(sec => sectors.add(sec));
    });
    return Array.from(sectors).sort();
  }, [allMatchedSublocations]);

  // === FILTERED SUBLOCATIONS WITH MEMOIZATION ===
  const filteredSublocations = useMemo(() => {
    return allMatchedSublocations.filter(sub => {
      // Min score filter
      if (sub.matchScore < minScoreFilter) return false;
      
      // Regio filter
      if (regioFilter !== "all") {
        const matchesRegio = sub.plaats === regioFilter || sub.provincie === regioFilter;
        if (!matchesRegio) return false;
      }
      
      // Sector filter
      if (sectorFilter !== "all") {
        const hasSector = sub.sector?.includes(sectorFilter);
        if (!hasSector) return false;
      }
      
      return true;
    });
  }, [allMatchedSublocations, regioFilter, sectorFilter, minScoreFilter]);

  // === FILTERED VACANCIES ===
  const filteredVacancies = useMemo(() => {
    return allMatchedVacancies.filter(vac => vac.matchScore >= minScoreFilter);
  }, [allMatchedVacancies, minScoreFilter]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (regioFilter !== "all") count++;
    if (sectorFilter !== "all") count++;
    if (minScoreFilter > 40) count++;
    return count;
  }, [regioFilter, sectorFilter, minScoreFilter]);

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

      const expertCount = await preloadExpertKnowledge();
      console.log(`[ApplicationMatchesTab] Loaded ${expertCount} expert specialisms`);

      const aiPatterns = await loadSuccessPatterns();
      setAiPatternsLoaded(aiPatterns.length);

      const applicantFunctie = getFieldValue(data.functie_niveau) as string | null;
      const applicantSectoren = (getFieldValue(data.ervaring_sector) as string[]) || [];
      const applicantDoelgroepen = (getFieldValue(data.doelgroep_ervaring) as string[]) || [];
      
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
        .limit(1000);

      if (subError) throw subError;

      const { data: existingMatches } = await supabase
        .from('application_sublocation_matches')
        .select('id, sublocation_id, status')
        .eq('application_id', application.id);

      const existingMatchMap = new Map(existingMatches?.map(m => [m.sublocation_id, m]) || []);

      const allUsedPatternIds: string[] = [];
      let maxAIBoost = 0;

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

        const aiBoostResult = calculateAILearningBoost(
          applicantFunctie,
          applicantSectoren,
          applicantDoelgroepen,
          aiPatterns,
          sub.gezochte_functies?.[0] || null,
          sub.sector || [],
          sub.doelgroep || []
        );

        if (aiBoostResult.usedPatternIds.length > 0) {
          allUsedPatternIds.push(...aiBoostResult.usedPatternIds);
        }
        if (aiBoostResult.boost > maxAIBoost) {
          maxAIBoost = aiBoostResult.boost;
        }

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
          provincie: sub.provincie,
        };
      });

      const scoredSublocationsRaw = await Promise.all(scoredSublocationsPromises);
      const allScoredSublocations = scoredSublocationsRaw
        .filter(sub => sub.matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore);

      setAllMatchedSublocations(allScoredSublocations);

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

      const { data: existingVacApps } = await supabase
        .from('vacancy_applications')
        .select('id, vacancy_id, status')
        .eq('application_id', application.id);

      const existingVacMap = new Map(existingVacApps?.map(v => [v.vacancy_id, v]) || []);

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

      const scoredVacanciesRaw = await Promise.all(scoredVacanciesPromises);
      const allScoredVacancies = scoredVacanciesRaw
        .filter(vac => vac.matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore);

      setAllMatchedVacancies(allScoredVacancies);
      setTotalAIBoost(maxAIBoost);

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

  const handleLinkToSublocation = useCallback(async (sublocation: MatchedSublocation) => {
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
  }, [application.id, onApplicationUpdated]);

  const handleLinkToVacancy = useCallback(async (vacancy: MatchedVacancy) => {
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
  }, [application.id, application.professional_id, onApplicationUpdated]);

  const toggleSublocationSelection = useCallback((id: string) => {
    setSelectedSublocations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVacancySelection = useCallback((id: string) => {
    setSelectedVacancies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllSublocations = useCallback(() => {
    const linkableIds = filteredSublocations
      .filter(s => !s.existingMatch)
      .map(s => s.id);
    setSelectedSublocations(new Set(linkableIds));
  }, [filteredSublocations]);

  const selectAllVacancies = useCallback(() => {
    const linkableIds = filteredVacancies
      .filter(v => !v.existingApplication)
      .map(v => v.id);
    setSelectedVacancies(new Set(linkableIds));
  }, [filteredVacancies]);

  const clearSelection = useCallback(() => {
    setSelectedSublocations(new Set());
    setSelectedVacancies(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setRegioFilter("all");
    setSectorFilter("all");
    setMinScoreFilter(40);
  }, []);

  const handleBulkLinkSublocations = async () => {
    if (selectedSublocations.size === 0) return;
    
    setBulkLinking(true);
    const toLink = filteredSublocations.filter(s =>
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
    const toLink = filteredVacancies.filter(v => 
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
      {/* AI Match Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-purple-500" />
          <span className="font-medium">AI-gedreven matching</span>
          <span className="text-muted-foreground">• {completenessScore}% profiel</span>
        </div>
        <div className="flex items-center gap-2">
          {totalAIBoost > 0 && (
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300">
              <Sparkles className="h-3 w-3 mr-1" />
              +{totalAIBoost}% AI boost
            </Badge>
          )}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4 mr-1" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* === QUICK FILTERS PANEL === */}
      {showFilters && (
        <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Quick Filters
            </h4>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Reset filters
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Regio Filter */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Regio / Plaats</label>
              <Select value={regioFilter} onValueChange={setRegioFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Alle regio's" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle regio's</SelectItem>
                  {uniqueRegios.map(regio => (
                    <SelectItem key={regio} value={regio}>{regio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sector Filter */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Sector</label>
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Alle sectoren" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle sectoren</SelectItem>
                  {uniqueSectors.map(sector => (
                    <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Min Score Filter */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Minimum score: {minScoreFilter}%
              </label>
              <Slider
                value={[minScoreFilter]}
                onValueChange={([val]) => setMinScoreFilter(val)}
                min={40}
                max={90}
                step={5}
                className="py-2"
              />
            </div>
          </div>

          {/* Filter Results Summary */}
          <div className="text-xs text-muted-foreground">
            {filteredSublocations.length} van {allMatchedSublocations.length} locaties • {filteredVacancies.length} van {allMatchedVacancies.length} vacatures
          </div>
        </div>
      )}

      {/* AI Patterns Info */}
      {aiPatternsLoaded > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span>{aiPatternsLoaded} geleerde patronen worden toegepast</span>
        </div>
      )}

      {/* Vacatures Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {filteredVacancies.filter(v => !v.existingApplication).length > 0 && (
              <Checkbox
                checked={selectedVacancies.size === filteredVacancies.filter(v => !v.existingApplication).length && selectedVacancies.size > 0}
                onCheckedChange={(checked) => checked ? selectAllVacancies() : setSelectedVacancies(new Set())}
                className="h-4 w-4"
              />
            )}
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Passende Vacatures
              <Badge variant="secondary" className="ml-1">{filteredVacancies.length}</Badge>
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={calculateMatches}>
            Ververs
          </Button>
        </div>

        {filteredVacancies.length > 0 ? (
          <div className="space-y-2">
            {filteredVacancies.map((vacancy) => (
              <VacancyCard
                key={vacancy.id}
                vacancy={vacancy}
                isSelected={selectedVacancies.has(vacancy.id)}
                onToggleSelection={toggleVacancySelection}
                onLink={handleLinkToVacancy}
                linking={linking}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">Geen passende vacatures gevonden</p>
          </div>
        )}
      </div>

      <Separator />

      {/* === VIRTUAL SCROLLING SUBLOCATIES === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {filteredSublocations.filter(s => !s.existingMatch).length > 0 && (
              <Checkbox
                checked={selectedSublocations.size === filteredSublocations.filter(s => !s.existingMatch).length && selectedSublocations.size > 0}
                onCheckedChange={(checked) => checked ? selectAllSublocations() : setSelectedSublocations(new Set())}
                className="h-4 w-4"
              />
            )}
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Passende Werklocaties
              <Badge variant="secondary" className="ml-1">{filteredSublocations.length}</Badge>
              {filteredSublocations.length !== allMatchedSublocations.length && (
                <span className="text-xs text-muted-foreground">
                  (gefilterd van {allMatchedSublocations.length})
                </span>
              )}
            </h3>
          </div>
        </div>

        {filteredSublocations.length > 0 ? (
          <div style={{ height: Math.min(filteredSublocations.length * 100, 600) }}>
            <Virtuoso
              data={filteredSublocations}
              itemContent={(index, sublocation) => (
                <div className="pb-2">
                  <SublocationCard
                    sublocation={sublocation}
                    isSelected={selectedSublocations.has(sublocation.id)}
                    onToggleSelection={toggleSublocationSelection}
                    onLink={handleLinkToSublocation}
                    linking={linking}
                  />
                </div>
              )}
              overscan={10}
            />
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">
              {activeFiltersCount > 0 
                ? "Geen locaties gevonden met huidige filters" 
                : "Geen passende werklocaties gevonden"}
            </p>
            {activeFiltersCount > 0 && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Filters resetten
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {totalSelected > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg">
            <ListChecks className="h-5 w-5" />
            <span className="font-medium">{totalSelected} geselecteerd</span>
            <Separator orientation="vertical" className="h-6 bg-primary-foreground/30" />
            {selectedSublocations.size > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkLinkSublocations}
                disabled={bulkLinking}
              >
                {bulkLinking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                {selectedSublocations.size} Voorstellen
              </Button>
            )}
            {selectedVacancies.size > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkLinkVacancies}
                disabled={bulkLinking}
              >
                {bulkLinking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                {selectedVacancies.size} Koppelen
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/20"
              onClick={clearSelection}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

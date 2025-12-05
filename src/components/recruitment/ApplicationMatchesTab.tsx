import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Loader2, Building2, MapPin, Users, Briefcase, Link2, Clock, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateApplicationMatchScore, type MatchScoreBreakdown } from "@/lib/services/matchingService";
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

      // Fetch active sublocations with their organization info
      const { data: sublocations, error: subError } = await supabase
        .from('client_sublocations')
        .select(`
          id, naam, plaats, sector, doelgroep, gezochte_functies, provincie,
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

      // Calculate match scores
      const scoredSublocations: MatchedSublocation[] = (sublocations || [])
        .map(sub => {
          const target = {
            gezochte_functies: sub.gezochte_functies,
            sector: sub.sector,
            doelgroep: sub.doelgroep,
            plaats: sub.plaats,
            provincie: sub.provincie,
          };

          const matchBreakdown = calculateApplicationMatchScore(application, target);

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
          };
        })
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

      // Calculate vacancy match scores
      const scoredVacancies: MatchedVacancy[] = (vacancies || [])
        .filter(vac => vac.sublocation)
        .map(vac => {
          const sub = vac.sublocation as any;
          const target = {
            gezochte_functies: [vac.functie_niveau, ...(sub?.gezochte_functies || [])],
            sector: sub?.sector,
            doelgroep: sub?.doelgroep,
            plaats: sub?.plaats,
            provincie: sub?.provincie,
          };

          const matchBreakdown = calculateApplicationMatchScore(application, target);

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
          };
        })
        .filter(vac => vac.matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      setMatchedVacancies(scoredVacancies);

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
          match_reasoning: sublocation.matchBreakdown as any,
          status: 'voorgesteld',
          created_by: user?.id,
        } as any);

      if (error) throw error;

      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Gekoppeld aan ${sublocation.naam}`, {
        description: `Match score: ${sublocation.matchScore}%`
      });

      // Refresh matches
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
          professional_id: application.professional_id, // Can be null now
          status: 'voorgesteld',
          match_score: vacancy.matchScore,
          match_reasoning: { score: vacancy.matchScore, breakdown: vacancy.matchBreakdown },
        } as any);

      if (error) throw error;

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Gekoppeld aan vacature: ${vacancy.titel}`, {
        description: `Match score: ${vacancy.matchScore}%`
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
        <p className="text-sm text-muted-foreground">Matches berekenen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Match Header */}
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <span className="font-medium">AI-gedreven matching</span>
        <span className="text-muted-foreground">• Gebaseerd op {completenessScore}% profiel compleetheid</span>
      </div>

      {/* Matching Vacatures Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Passende Vacatures
            {matchedVacancies.length > 0 && (
              <Badge variant="secondary" className="ml-1">{matchedVacancies.length}</Badge>
            )}
          </h3>
          <Button variant="ghost" size="sm" onClick={calculateMatches}>
            Ververs
          </Button>
        </div>

        {matchedVacancies.length > 0 ? (
          <div className="space-y-2">
            {matchedVacancies.slice(0, 5).map((vacancy) => (
              <div 
                key={vacancy.id}
                className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{vacancy.titel}</span>
                      {vacancy.urgentie === 'hoog' && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>
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
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getScoreColor(vacancy.matchScore)}`}>
                        {vacancy.matchScore}%
                      </div>
                      <Progress 
                        value={vacancy.matchScore} 
                        className={`h-1.5 w-16 ${getProgressColor(vacancy.matchScore)}`}
                      />
                    </div>
                    
                    {!vacancy.existingApplication ? (
                      <Button
                        size="sm"
                        onClick={() => handleLinkToVacancy(vacancy)}
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
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Passende Werklocaties
            {matchedSublocations.length > 0 && (
              <Badge variant="secondary" className="ml-1">{matchedSublocations.length}</Badge>
            )}
          </h3>
        </div>

        {matchedSublocations.length > 0 ? (
          <div className="space-y-2">
            {matchedSublocations.slice(0, 5).map((sublocation) => (
              <div 
                key={sublocation.id}
                className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{sublocation.naam}</span>
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
                    {/* Sector/Doelgroep badges */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sublocation.sector?.slice(0, 2).map(s => (
                        <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                      ))}
                      {sublocation.doelgroep?.slice(0, 2).map(d => (
                        <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-300">{d}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getScoreColor(sublocation.matchScore)}`}>
                        {sublocation.matchScore}%
                      </div>
                      <Progress 
                        value={sublocation.matchScore} 
                        className={`h-1.5 w-16 ${getProgressColor(sublocation.matchScore)}`}
                      />
                    </div>
                    
                    {!sublocation.existingMatch ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLinkToSublocation(sublocation)}
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
                      <Button size="sm" variant="ghost" disabled>
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
          </div>
        )}
      </div>
    </div>
  );
}

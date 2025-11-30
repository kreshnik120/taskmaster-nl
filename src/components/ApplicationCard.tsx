import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { GripVertical, Phone, Calendar, Mail, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ProgressRing } from "@/components/recruitment/ProgressRing";
import { InlineMatchPreview } from "@/components/recruitment/InlineMatchPreview";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateSublocationMatchScore } from "@/lib/calculateSublocationMatchScore";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  created_at: string;
  updated_at: string | null;
  extracted_data?: {
    naam?: string;
    werkvorm?: string;
    functie_niveau?: string;
    assigned_organization?: string;
    telefoon?: string;
    regio?: string;
    ervaring_sector?: string[];
    doelgroep_ervaring?: string[];
  } | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface ApplicationCardProps {
  application: Application;
  onClick: () => void;
  searchQuery?: string;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export function ApplicationCard({ application, onClick, searchQuery = "", isSelected = false, onSelect }: ApplicationCardProps) {
  const { toast } = useToast();

  // Fetch clients for matching
  const { data: clients } = useQuery({
    queryKey: ["clients-for-matching"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company, regio, sector, doelgroep, gezochte_functies, client_org_id")
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate best match
  const bestMatch = clients && application.extracted_data ? (() => {
    const professional = {
      functie_niveau: application.extracted_data.functie_niveau || "",
      regio: application.extracted_data.regio || "",
      ervaring_sector: application.extracted_data.ervaring_sector || [],
      doelgroep_ervaring: application.extracted_data.doelgroep_ervaring || [],
      skills: [],
      beschikbaarheidsnotities: "",
    };

    let topMatch: { client: any; score: number; reasoning: string[] } | null = null;

    for (const client of clients) {
      const criteria = {
        gezochte_functies: client.gezochte_functies || [],
        sector: client.sector || [],
        doelgroep: client.doelgroep || [],
        regio: client.regio?.[0] || "",
        plaats: "", // Not used in matching but required by interface
      };

      const matchResult = calculateSublocationMatchScore(professional, criteria);

      if (!topMatch || matchResult.totalScore > topMatch.score) {
        topMatch = {
          client,
          score: matchResult.totalScore,
          reasoning: matchResult.reasoning,
        };
      }
    }

    return topMatch;
  })() : null;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const candidateName = application.extracted_data?.naam || 'Onbekende kandidaat';
  const werkvorm = application.extracted_data?.werkvorm;
  const functieNiveau = application.extracted_data?.functie_niveau || application.professionals?.functie_niveau;
  const assignedOrg = application.extracted_data?.assigned_organization;
  const completenessScore = application.completeness_score || 0;
  
  // Highlight search matches
  const highlightText = (text: string) => {
    if (!searchQuery || !text) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? 
        <mark key={i} className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark> : 
        part
    );
  };

  // Quick actions
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = application.extracted_data?.telefoon;
    if (phone) {
      toast({ title: "Bellen", description: `Bel ${candidateName} op ${phone}` });
    } else {
      toast({ title: "Geen telefoonnummer", description: "Voeg eerst een telefoonnummer toe", variant: "destructive" });
    }
  };

  const handleScheduleInterview = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast({ title: "Interview plannen", description: `Plan interview met ${candidateName}` });
  };

  const handleEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast({ title: "Email versturen", description: `Stuur email naar ${application.email_from}` });
  };
  
  const getCompletenessColor = (score: number) => {
    if (score === 100) return "text-emerald-600";
    if (score >= 80) return "text-blue-600";
    return "text-amber-600";
  };
  
  const getCardBorder = (score: number) => {
    if (score === 100) return "border-l-2 border-l-emerald-400";
    return "";
  };
  
  const getDaysInStage = () => {
    const lastUpdate = new Date(application.updated_at || application.created_at);
    const now = new Date();
    const days = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };
  
  const daysInStage = getDaysInStage();
  const isStagnant = daysInStage >= 5;
  
  const getStatusDotColor = () => {
    if (daysInStage < 2) return "bg-muted-foreground/30";
    if (daysInStage < 5) return "bg-muted-foreground/50";
    return "bg-destructive/60";
  };

  // Handle bureau assignment
  const handleAssignBureau = async (e: React.MouseEvent, bureau: string) => {
    e.stopPropagation();
    
    const { error } = await supabase
      .from("professional_applications")
      .update({
        extracted_data: {
          ...application.extracted_data,
          assigned_organization: bureau,
        },
      })
      .eq("id", application.id);

    if (error) {
      toast({ title: "Fout", description: "Bureau toewijzing mislukt", variant: "destructive" });
    } else {
      toast({ title: "Toegewezen", description: `Bureau: ${bureau}` });
    }
  };
  
  const getHumanizedTime = () => {
    if (daysInStage === 0) return "Vandaag";
    if (daysInStage === 1) return "Gisteren";
    if (daysInStage < 7) return `${daysInStage} dagen`;
    const weeks = Math.floor(daysInStage / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weken'}`;
  };

  // Get initials from candidate name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Generate consistent color based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-100 text-blue-700',
      'bg-green-100 text-green-700',
      'bg-purple-100 text-purple-700',
      'bg-amber-100 text-amber-700',
      'bg-rose-100 text-rose-700',
      'bg-cyan-100 text-cyan-700',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <HoverCard openDelay={500}>
      <HoverCardTrigger asChild>
        <div ref={setNodeRef} style={style} className="group">
          <Card
            className={`hover:scale-[1.01] hover:shadow-md active:scale-[0.99] transition-all duration-200 ease-out border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 relative ${getCardBorder(completenessScore)}`}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                {/* Checkbox (if onSelect provided) */}
                {onSelect && (
                  <div className="flex-shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={onSelect}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                )}

                {/* Drag Handle */}
                <div
                  {...attributes}
                  {...listeners}
                  className="flex-shrink-0 pt-1 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-60 transition-opacity"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Card Content - Clickable */}
                <div className="flex-1 min-w-0 space-y-2 cursor-pointer" onClick={onClick}>
                  {/* Header: Avatar + Name + Progress Ring + Match Badge */}
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 flex-shrink-0">
                      <AvatarFallback className={`text-xs font-medium ${getAvatarColor(candidateName)}`}>
                        {getInitials(candidateName)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-medium text-foreground truncate flex-1">
                      {highlightText(candidateName)}
                    </p>
                    {bestMatch && bestMatch.score >= 50 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30">
                        {bestMatch.score}%
                      </Badge>
                    )}
                    <div className="flex-shrink-0">
                      <ProgressRing progress={completenessScore} size={28} strokeWidth={2.5} />
                    </div>
                  </div>

                  {/* Email */}
                  <p className="text-xs text-muted-foreground truncate">
                    {highlightText(application.email_from)}
                  </p>

                  {/* Metadata row with bullets */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    {functieNiveau && <span>{functieNiveau}</span>}
                    {functieNiveau && werkvorm && <span>•</span>}
                    {werkvorm && <span>{werkvorm}</span>}
                    {assignedOrg && (functieNiveau || werkvorm) && <span>•</span>}
                    {assignedOrg && <span>{assignedOrg}</span>}
                  </div>

                  {/* Time in stage with stagnation badge */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {getHumanizedTime()}
                      </span>
                      {isStagnant && (
                        <Badge variant="destructive" className="h-4 px-1.5 py-0 text-[10px] gap-1">
                          <AlertCircle className="h-2.5 w-2.5" />
                          Stagneert
                        </Badge>
                      )}
                    </div>
                    <div className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor()}`} />
                  </div>

                  {/* Inline Bureau Toggle (hover) */}
                  {!assignedOrg && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={(e) => handleAssignBureau(e, "ABCzorg")}
                      >
                        ABCzorg
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2"
                        onClick={(e) => handleAssignBureau(e, "CitoZorg")}
                      >
                        CitoZorg
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>

            {/* Quick Actions (Hover Only) */}
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleCall}
                title="Bel kandidaat"
              >
                <Phone className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleScheduleInterview}
                title="Plan interview"
              >
                <Calendar className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleEmail}
                title="Stuur email"
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="right" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">{candidateName}</h4>
            <div className="space-y-1 text-xs text-muted-foreground mt-2">
              {application.extracted_data?.telefoon && (
                <p>📞 {application.extracted_data.telefoon}</p>
              )}
              <p>✉️ {application.email_from}</p>
              {application.extracted_data?.regio && (
                <p>📍 {application.extracted_data.regio}</p>
              )}
              {functieNiveau && <p>💼 {functieNiveau}</p>}
              {werkvorm && <p>🏢 {werkvorm}</p>}
              {application.extracted_data?.ervaring_sector && application.extracted_data.ervaring_sector.length > 0 && (
                <p>🏥 {application.extracted_data.ervaring_sector.join(", ")}</p>
              )}
              <p className="text-[10px] mt-2 text-muted-foreground/60">
                Aangemaakt: {new Date(application.created_at).toLocaleDateString('nl-NL')}
              </p>
            </div>
          </div>

          {/* Top Match Preview */}
          {bestMatch && bestMatch.score >= 50 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-2">Beste match</h5>
              <InlineMatchPreview
                clientName={bestMatch.client.name}
                matchScore={bestMatch.score}
                matchReasoning={bestMatch.reasoning}
              />
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Skeleton loading component
export function ApplicationCardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Skeleton className="h-4 w-4 mt-1" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-24" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

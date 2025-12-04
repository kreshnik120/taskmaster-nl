import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Link2, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LinkingStats {
  totalClients: number;
  linkedClients: number;
  unlinkedClients: number;
  totalOrganizations: number;
}

interface UnlinkedClient {
  id: string;
  name: string;
  company: string;
  suggestedOrg?: {
    id: string;
    name: string;
    matchScore: number;
  };
}

export function DataLinkingIndicator({ onRefresh }: { onRefresh?: () => void }) {
  const [stats, setStats] = useState<LinkingStats | null>(null);
  const [unlinkedClients, setUnlinkedClients] = useState<UnlinkedClient[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load stats via direct queries
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, company, client_org_id');
      
      const { data: orgs } = await supabase
        .from('client_organizations')
        .select('id, name')
        .order('name');

      const totalClients = clients?.length || 0;
      const linkedClients = clients?.filter(c => c.client_org_id)?.length || 0;
      
      setStats({
        totalClients,
        linkedClients,
        unlinkedClients: totalClients - linkedClients,
        totalOrganizations: orgs?.length || 0
      });

      setOrganizations(orgs || []);

      // Find unlinked clients with suggested organizations
      const unlinked = clients?.filter(c => !c.client_org_id) || [];
      const withSuggestions = unlinked.map(client => {
        const suggestion = findBestMatch(client.name, orgs || []);
        return {
          ...client,
          suggestedOrg: suggestion
        };
      });
      
      setUnlinkedClients(withSuggestions);
    } catch (error) {
      console.error('Error loading linking stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Find best matching organization based on name similarity
  const findBestMatch = (clientName: string, orgs: { id: string; name: string }[]) => {
    const normalizedClientName = clientName.toLowerCase()
      .replace(/stichting/gi, '')
      .replace(/hoofdkantoor/gi, '')
      .replace(/b\.?v\.?/gi, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let bestMatch: { id: string; name: string; matchScore: number } | undefined;
    let highestScore = 0;

    for (const org of orgs) {
      const normalizedOrgName = org.name.toLowerCase()
        .replace(/stichting/gi, '')
        .replace(/b\.?v\.?/gi, '')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Check for exact match or contains
      if (normalizedClientName.includes(normalizedOrgName) || 
          normalizedOrgName.includes(normalizedClientName)) {
        const score = Math.max(
          normalizedOrgName.length / normalizedClientName.length,
          normalizedClientName.length / normalizedOrgName.length
        ) * 100;
        
        if (score > highestScore && score > 30) {
          highestScore = score;
          bestMatch = { id: org.id, name: org.name, matchScore: Math.min(100, Math.round(score)) };
        }
      }

      // Word-based matching
      const clientWords = normalizedClientName.split(' ').filter(w => w.length > 2);
      const orgWords = normalizedOrgName.split(' ').filter(w => w.length > 2);
      
      const matchingWords = clientWords.filter(cw => 
        orgWords.some(ow => ow.includes(cw) || cw.includes(ow))
      );

      if (matchingWords.length > 0) {
        const wordScore = (matchingWords.length / Math.max(clientWords.length, orgWords.length)) * 100;
        if (wordScore > highestScore && wordScore > 30) {
          highestScore = wordScore;
          bestMatch = { id: org.id, name: org.name, matchScore: Math.round(wordScore) };
        }
      }
    }

    return bestMatch;
  };

  const autoLinkAll = async () => {
    const toLink = unlinkedClients.filter(c => c.suggestedOrg && c.suggestedOrg.matchScore >= 50);
    
    if (toLink.length === 0) {
      toast.info('Geen automatisch koppelbare klanten gevonden');
      return;
    }

    setLinking(true);
    let linked = 0;
    let failed = 0;

    for (const client of toLink) {
      try {
        const { error } = await supabase
          .from('clients')
          .update({ client_org_id: client.suggestedOrg!.id })
          .eq('id', client.id);

        if (error) throw error;
        linked++;
      } catch (error) {
        console.error(`Failed to link ${client.name}:`, error);
        failed++;
      }
    }

    setLinking(false);
    toast.success(`${linked} klanten automatisch gekoppeld${failed > 0 ? `, ${failed} mislukt` : ''}`);
    loadStats();
    onRefresh?.();
  };

  const linkSingle = async (clientId: string, orgId: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ client_org_id: orgId })
        .eq('id', clientId);

      if (error) throw error;
      toast.success('Klant gekoppeld');
      loadStats();
      onRefresh?.();
    } catch (error) {
      console.error('Failed to link client:', error);
      toast.error('Koppeling mislukt');
    }
  };

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Laden...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.unlinkedClients === 0) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Alle klanten gekoppeld aan organisaties</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const linkagePercentage = Math.round((stats.linkedClients / stats.totalClients) * 100);
  const autoLinkableCount = unlinkedClients.filter(c => c.suggestedOrg && c.suggestedOrg.matchScore >= 50).length;

  return (
    <>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {stats.unlinkedClients} klanten niet gekoppeld
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {linkagePercentage}% gekoppeld
                  </Badge>
                </div>
                <Progress value={linkagePercentage} className="h-1.5 w-full max-w-[200px]" />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {autoLinkableCount > 0 && (
                <Button
                  size="sm"
                  onClick={autoLinkAll}
                  disabled={linking}
                  className="gap-2"
                >
                  {linking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Auto-link ({autoLinkableCount})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                Bekijk details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Klant-Organisatie Koppelingen</DialogTitle>
            <DialogDescription>
              {stats.unlinkedClients} van {stats.totalClients} klanten zijn nog niet gekoppeld aan een organisatie
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {unlinkedClients.map(client => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{client.company}</p>
                  </div>
                  
                  {client.suggestedOrg ? (
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Suggestie:</p>
                        <p className="text-sm font-medium">{client.suggestedOrg.name}</p>
                      </div>
                      <Badge 
                        variant={client.suggestedOrg.matchScore >= 70 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {client.suggestedOrg.matchScore}%
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => linkSingle(client.id, client.suggestedOrg!.id)}
                      >
                        Koppel
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Geen match gevonden
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

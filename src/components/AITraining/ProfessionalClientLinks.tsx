import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DetectedLink {
  id: string;
  professional_name: string;
  client_name: string;
  source_file: string;
  confidence: number;
  status: "auto_approved" | "needs_review" | "rejected";
  notes: string;
  created_at: string;
}

export function ProfessionalClientLinks() {
  const [links, setLinks] = useState<DetectedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      setLoading(true);
      
      // Fetch professional-client relationships with auto-detected notes
      const { data: pcData, error: pcError } = await supabase
        .from('professional_clients')
        .select(`
          id,
          professional_id,
          client_id,
          notes,
          created_at,
          professionals(full_name),
          clients(name)
        `)
        .ilike('notes', '%Auto-detected%')
        .order('created_at', { ascending: false })
        .limit(50);

      if (pcError) throw pcError;

      const formattedLinks: DetectedLink[] = (pcData || []).map((pc: any) => {
        const needsReview = pc.notes?.includes('[NEEDS REVIEW]');
        const confidence = parseFloat(pc.notes?.match(/confidence: (0\.\d+)/)?.[1] || '0.0');
        const sourceFile = pc.notes?.match(/from (.+?) \(/)?.[1] || 'Unknown';

        return {
          id: pc.id,
          professional_name: pc.professionals?.full_name || 'Unknown',
          client_name: pc.clients?.name || 'Unknown',
          source_file: sourceFile,
          confidence,
          status: needsReview ? 'needs_review' : 'auto_approved',
          notes: pc.notes || '',
          created_at: pc.created_at
        };
      });

      setLinks(formattedLinks);
    } catch (error: any) {
      console.error('Error loading links:', error);
      toast({
        title: "Fout bij laden",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (linkId: string) => {
    try {
      // Remove [NEEDS REVIEW] from notes
      const link = links.find(l => l.id === linkId);
      if (!link) return;

      const updatedNotes = link.notes.replace('[NEEDS REVIEW]', '[APPROVED]');

      const { error } = await supabase
        .from('professional_clients')
        .update({ notes: updatedNotes })
        .eq('id', linkId);

      if (error) throw error;

      toast({
        title: "Goedgekeurd",
        description: `Koppeling ${link.professional_name} - ${link.client_name} is goedgekeurd`,
      });

      await loadLinks();
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleReject = async (linkId: string) => {
    try {
      const link = links.find(l => l.id === linkId);
      if (!link) return;

      // Set is_active to false instead of deleting
      const { error } = await supabase
        .from('professional_clients')
        .update({ 
          is_active: false,
          notes: link.notes.replace('[NEEDS REVIEW]', '[REJECTED]')
        })
        .eq('id', linkId);

      if (error) throw error;

      toast({
        title: "Afgewezen",
        description: `Koppeling ${link.professional_name} - ${link.client_name} is afgewezen`,
      });

      await loadLinks();
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string, confidence: number) => {
    switch (status) {
      case 'auto_approved':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Auto-goedgekeurd</Badge>;
      case 'needs_review':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="w-3 h-3 mr-1" /> Controle nodig</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Afgewezen</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              🔗 Auto-Detected Professional-Client Koppelingen
            </CardTitle>
            <CardDescription>
              Relaties automatisch gedetecteerd uit geüploade documenten
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadLinks}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Vernieuwen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nog geen automatisch gedetecteerde koppelingen.</p>
            <p className="text-sm mt-2">Upload documenten met professional-client informatie om te beginnen.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Professional</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Bron</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">{link.professional_name}</TableCell>
                  <TableCell>{link.client_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{link.source_file}</TableCell>
                  <TableCell>
                    <Badge variant={link.confidence >= 0.85 ? "default" : "secondary"}>
                      {(link.confidence * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(link.status, link.confidence)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(link.created_at).toLocaleDateString('nl-NL')}
                  </TableCell>
                  <TableCell className="text-right">
                    {link.status === 'needs_review' && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApprove(link.id)}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(link.id)}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
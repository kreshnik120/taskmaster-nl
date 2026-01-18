import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, XCircle, Clock, User, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PendingReview } from "@/types/recruitment";

interface HumanReviewQueueProps {
  onViewApplication?: (applicationId: string) => void;
}

export function HumanReviewQueue({ onViewApplication }: HumanReviewQueueProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [decision, setDecision] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: pendingReviews, isLoading } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_reviews_with_details')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return (data || []) as PendingReview[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const completeReviewMutation = useMutation({
    mutationFn: async ({ reviewId, decision, notes }: { reviewId: string; decision: string; notes: string }) => {
      const { data, error } = await supabase.rpc('complete_human_review', {
        p_review_id: reviewId,
        p_decision: decision,
        p_notes: notes || null,
        p_override_reason: decision === 'approve' ? 'Handmatig goedgekeurd na review' : null,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      
      if (data?.success) {
        toast.success(`Review afgerond: ${decision === 'approve' ? 'Goedgekeurd' : decision === 'reject' ? 'Afgewezen' : 'Meer info nodig'}`);
      } else {
        toast.error(data?.error || 'Er ging iets mis');
      }
      
      setSelectedReview(null);
      setReviewNotes("");
      setDecision("");
    },
    onError: (error) => {
      console.error('Review error:', error);
      toast.error('Fout bij afronden review');
    },
  });

  const handleSubmitReview = () => {
    if (!selectedReview || !decision) {
      toast.error('Selecteer een beslissing');
      return;
    }
    
    completeReviewMutation.mutate({
      reviewId: selectedReview.id,
      decision,
      notes: reviewNotes,
    });
  };

  const getPriorityBadge = (priority: number) => {
    if (priority <= 3) return <Badge variant="destructive" className="text-xs">Hoog</Badge>;
    if (priority <= 6) return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">Medium</Badge>;
    return <Badge variant="outline" className="text-xs">Laag</Badge>;
  };

  const getReviewTypeBadge = (type: string) => {
    switch (type) {
      case 'low_confidence_rejection':
        return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">Lage AI Confidence</Badge>;
      case 'data_conflict':
        return <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Data Conflict</Badge>;
      case 'must_have_fail':
        return <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">Must-have Ontbreekt</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  if (isLoading) return null;
  
  const reviewCount = pendingReviews?.length || 0;
  if (reviewCount === 0) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50 mb-4">
        <CardHeader className="py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base font-medium text-amber-800">
                Human Review Queue
              </CardTitle>
              <Badge variant="secondary" className="bg-amber-200 text-amber-800">
                {reviewCount} {reviewCount === 1 ? 'wachtend' : 'wachtend'}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              {pendingReviews?.map((review) => (
                <div
                  key={review.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{review.candidate_name}</span>
                        {getPriorityBadge(review.priority)}
                        {getReviewTypeBadge(review.review_type)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{review.functie_niveau || 'Onbekend niveau'}</span>
                        <span>•</span>
                        <span>Confidence: {Math.round((review.ai_confidence || 0) * 100)}%</span>
                        <span>•</span>
                        <span>Aangemaakt {format(new Date(review.created_at), 'd MMM', { locale: nl })}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {review.escalation_reason}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-2">
                    {onViewApplication && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewApplication(review.application_id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Bekijk
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedReview(review);
                        setDecision("");
                        setReviewNotes("");
                      }}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Review: {selectedReview?.candidate_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* AI Recommendation */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">AI Aanbeveling</span>
                <Badge variant={selectedReview?.ai_recommendation === 'reject' ? 'destructive' : 'secondary'}>
                  {selectedReview?.ai_recommendation === 'reject' ? 'Afwijzen' : selectedReview?.ai_recommendation}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Confidence: {Math.round((selectedReview?.ai_confidence || 0) * 100)}%
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedReview?.escalation_reason}
              </p>
            </div>

            {/* Candidate Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>
                <p className="font-medium truncate">{selectedReview?.candidate_email}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Functie niveau:</span>
                <p className="font-medium">{selectedReview?.functie_niveau || 'Onbekend'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Completeness:</span>
                <p className="font-medium">{selectedReview?.completeness_score || 0}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Huidige stage:</span>
                <p className="font-medium capitalize">{selectedReview?.current_stage}</p>
              </div>
            </div>

            {/* Decision */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Jouw beslissing</label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer beslissing..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Goedkeuren - Doorzetten naar screening
                    </div>
                  </SelectItem>
                  <SelectItem value="reject">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      Afwijzen - Bevestig AI aanbeveling
                    </div>
                  </SelectItem>
                  <SelectItem value="needs_more_info">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      Meer info nodig - Terug naar intake
                    </div>
                  </SelectItem>
                  <SelectItem value="defer">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-600" />
                      Uitstellen - Later beslissen
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Notities (optioneel)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Voeg context toe voor je beslissing..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReview(null)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleSubmitReview}
              disabled={!decision || completeReviewMutation.isPending}
            >
              {completeReviewMutation.isPending ? 'Bezig...' : 'Bevestig beslissing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

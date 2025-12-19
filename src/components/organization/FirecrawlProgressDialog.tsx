import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Mail, Globe, Building2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EnrichmentLogEntry {
  orgName: string;
  status: "pending" | "processing" | "success" | "error" | "timeout";
  emailFound?: string;
  websiteDetected?: string;
  error?: string;
  sectorsFound?: string[];
}

interface FirecrawlProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number;
  total: number;
  logs: EnrichmentLogEntry[];
  isComplete: boolean;
  onClose?: () => void;
}

export function FirecrawlProgressDialog({
  open,
  onOpenChange,
  current,
  total,
  logs,
  isComplete,
  onClose,
}: FirecrawlProgressDialogProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  
  // Calculate stats
  const successCount = logs.filter(l => l.status === "success").length;
  const errorCount = logs.filter(l => l.status === "error").length;
  const timeoutCount = logs.filter(l => l.status === "timeout").length;
  const emailsFound = logs.filter(l => l.emailFound).length;
  const websitesDetected = logs.filter(l => l.websiteDetected).length;

  const getStatusIcon = (status: EnrichmentLogEntry["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "timeout":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "processing":
        return <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-muted" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {isComplete ? "Verrijking Voltooid" : "Organisaties Verrijken"}
          </DialogTitle>
          <DialogDescription>
            {isComplete 
              ? `${successCount} van ${total} organisaties succesvol verrijkt`
              : `Bezig met verrijken van ${total} organisaties...`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{current} van {total}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Stats summary */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            {successCount} succesvol
          </Badge>
          {emailsFound > 0 && (
            <Badge variant="outline" className="gap-1">
              <Mail className="h-3 w-3 text-blue-500" />
              {emailsFound} emails
            </Badge>
          )}
          {websitesDetected > 0 && (
            <Badge variant="outline" className="gap-1">
              <Globe className="h-3 w-3 text-purple-500" />
              {websitesDetected} websites
            </Badge>
          )}
          {timeoutCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3 text-yellow-500" />
              {timeoutCount} timeouts
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3 text-destructive" />
              {errorCount} fouten
            </Badge>
          )}
        </div>

        {/* Live log */}
        <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-md p-2">
          <div className="space-y-1">
            {logs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Wachten op verrijking...
              </p>
            )}
            {logs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-2 p-2 rounded text-sm",
                  log.status === "processing" && "bg-primary/5",
                  log.status === "success" && "bg-green-500/5",
                  log.status === "error" && "bg-destructive/5",
                  log.status === "timeout" && "bg-yellow-500/5"
                )}
              >
                {getStatusIcon(log.status)}
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{log.orgName}</span>
                  {log.status === "success" && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {log.emailFound && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Mail className="h-3 w-3" />
                          {log.emailFound}
                        </Badge>
                      )}
                      {log.websiteDetected && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Globe className="h-3 w-3" />
                          Website
                        </Badge>
                      )}
                      {log.sectorsFound && log.sectorsFound.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {log.sectorsFound.join(", ")}
                        </Badge>
                      )}
                      {!log.emailFound && !log.websiteDetected && !log.sectorsFound?.length && (
                        <span className="text-xs text-muted-foreground">Verrijkt</span>
                      )}
                    </div>
                  )}
                  {log.status === "error" && log.error && (
                    <span className="text-xs text-destructive block mt-0.5">{log.error}</span>
                  )}
                  {log.status === "timeout" && (
                    <span className="text-xs text-yellow-600 block mt-0.5">Website timeout</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Results summary (only when complete) */}
        {isComplete && (
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-medium text-sm">Samenvatting</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>{successCount} succesvol verrijkt</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-500" />
                <span>{emailsFound} nieuwe emails</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-500" />
                <span>{websitesDetected} websites gedetecteerd</span>
              </div>
              {timeoutCount > 0 && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>{timeoutCount} timeouts</span>
                </div>
              )}
            </div>
            
            {/* Failed organizations */}
            {(errorCount > 0 || timeoutCount > 0) && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Mislukt:</p>
                <div className="flex flex-wrap gap-1">
                  {logs
                    .filter(l => l.status === "error" || l.status === "timeout")
                    .slice(0, 10)
                    .map((log, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {log.orgName}
                      </Badge>
                    ))}
                  {logs.filter(l => l.status === "error" || l.status === "timeout").length > 10 && (
                    <Badge variant="outline" className="text-xs">
                      +{logs.filter(l => l.status === "error" || l.status === "timeout").length - 10} meer
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {isComplete && (
          <div className="flex justify-end pt-2">
            <Button onClick={() => { onOpenChange(false); onClose?.(); }}>
              Sluiten
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

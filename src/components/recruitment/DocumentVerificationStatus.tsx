import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  FileWarning
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type VogStatus = 'missing' | 'received' | 'validating' | 'authentic_ok' | 'authentic_fail' | 'expired' | 'manual_review';
type DiplomaStatus = 'missing' | 'received' | 'verified_emrex' | 'verified_manual' | 'verified_duo' | 'duo_pending' | 'duo_invalid' | 'duo_not_digital' | 'duo_error' | 'manual_review';

interface DocumentVerificationStatusProps {
  applicationId: string;
  vogStatus: VogStatus;
  vogSource?: string | null;
  vogIssueDate?: string | null;
  vogValidUntil?: string | null;
  vogVerificationResponse?: Record<string, unknown> | null;
  diplomaStatus: DiplomaStatus;
  diplomaSource?: string | null;
  vogFilePath?: string | null;
  diplomaFilePath?: string | null;
  duoVerificationResult?: Record<string, unknown> | null;
  duoVerifiedAt?: string | null;
  onStatusUpdate?: () => void;
}

const VOG_STATUS_CONFIG: Record<VogStatus, { icon: React.ElementType; label: string; color: string; description: string }> = {
  missing: { 
    icon: FileWarning, 
    label: 'Ontbreekt', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'VOG document nog niet ontvangen'
  },
  received: { 
    icon: Clock, 
    label: 'Ontvangen', 
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'VOG ontvangen, wacht op verificatie'
  },
  validating: { 
    icon: Loader2, 
    label: 'Valideren...', 
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    description: 'GAAV verificatie wordt uitgevoerd'
  },
  authentic_ok: { 
    icon: ShieldCheck, 
    label: 'Geverifieerd', 
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    description: 'VOG is authentiek en geldig'
  },
  authentic_fail: { 
    icon: ShieldX, 
    label: 'Ongeldig', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'VOG is niet authentiek of integer'
  },
  expired: { 
    icon: XCircle, 
    label: 'Verlopen', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'VOG is ouder dan 3 maanden'
  },
  manual_review: { 
    icon: ShieldAlert, 
    label: 'Handmatig', 
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'Handmatige verificatie vereist'
  },
};

const DIPLOMA_STATUS_CONFIG: Record<DiplomaStatus, { icon: React.ElementType; label: string; color: string; description: string }> = {
  missing: { 
    icon: FileWarning, 
    label: 'Ontbreekt', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'Diploma document nog niet ontvangen'
  },
  received: { 
    icon: Clock, 
    label: 'Ontvangen', 
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'Diploma ontvangen, wacht op verificatie'
  },
  duo_pending: { 
    icon: Loader2, 
    label: 'DUO Verificatie...', 
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    description: 'DUO Online Diplomacontrole wordt uitgevoerd'
  },
  verified_duo: { 
    icon: ShieldCheck, 
    label: 'DUO Geverifieerd', 
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    description: 'Diploma geverifieerd via DUO Online Diplomacontrole'
  },
  duo_invalid: { 
    icon: ShieldX, 
    label: 'DUO Ongeldig', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'Diploma niet gevonden in DUO register'
  },
  duo_not_digital: { 
    icon: ShieldAlert, 
    label: 'Niet Digitaal', 
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'Diploma van voor 1996 of niet digitaal geregistreerd'
  },
  duo_error: { 
    icon: XCircle, 
    label: 'DUO Fout', 
    color: 'bg-destructive/10 text-destructive border-destructive/20',
    description: 'Fout bij DUO verificatie, probeer opnieuw'
  },
  verified_emrex: { 
    icon: CheckCircle2, 
    label: 'EMREX Verified', 
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    description: 'Diploma geverifieerd via DUO EMREX'
  },
  verified_manual: { 
    icon: CheckCircle2, 
    label: 'Handmatig Verified', 
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    description: 'Diploma handmatig geverifieerd'
  },
  manual_review: { 
    icon: AlertCircle, 
    label: 'Controle Nodig', 
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    description: 'Handmatige controle vereist'
  },
};

export function DocumentVerificationStatus({
  applicationId,
  vogStatus,
  vogSource,
  vogIssueDate,
  vogValidUntil,
  vogVerificationResponse,
  diplomaStatus,
  diplomaSource,
  vogFilePath,
  diplomaFilePath,
  duoVerificationResult,
  duoVerifiedAt,
  onStatusUpdate
}: DocumentVerificationStatusProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDuoVerifying, setIsDuoVerifying] = useState(false);
  const [isManualVerifying, setIsManualVerifying] = useState<'vog' | 'diploma' | null>(null);

  const vogConfig = VOG_STATUS_CONFIG[vogStatus] || VOG_STATUS_CONFIG.missing;
  const diplomaConfig = DIPLOMA_STATUS_CONFIG[diplomaStatus] || DIPLOMA_STATUS_CONFIG.missing;

  const VogIcon = vogConfig.icon;
  const DiplomaIcon = diplomaConfig.icon;

  // Trigger GAAV verification
  const handleGaavVerification = async () => {
    if (!vogFilePath) {
      toast.error('Geen VOG bestand beschikbaar');
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-vog-gaav', {
        body: {
          application_id: applicationId,
          vog_file_path: vogFilePath,
          force_revalidation: true
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(
          data.validation_status === 'authentic_ok' 
            ? 'VOG is authentiek en geldig!' 
            : `VOG status: ${data.validation_status}`
        );
        onStatusUpdate?.();
      } else {
        toast.error(data?.error || 'Verificatie mislukt');
      }
    } catch (error) {
      console.error('GAAV verification error:', error);
      toast.error('Fout bij GAAV verificatie');
    } finally {
      setIsVerifying(false);
    }
  };

  // Trigger DUO verification
  const handleDuoVerification = async () => {
    if (!diplomaFilePath) {
      toast.error('Geen diploma bestand beschikbaar');
      return;
    }

    setIsDuoVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-diploma-duo', {
        body: {
          action: 'verify',
          application_id: applicationId
        }
      });

      if (error) throw error;

      if (data?.success) {
        const statusMsg = data.status === 'verified_duo' 
          ? 'Diploma geverifieerd via DUO!' 
          : data.status === 'duo_invalid'
          ? 'Diploma niet gevonden in DUO register'
          : data.status === 'duo_not_digital'
          ? 'Diploma niet digitaal geregistreerd'
          : `DUO status: ${data.status}`;
        
        toast.success(statusMsg);
        onStatusUpdate?.();
      } else {
        toast.error(data?.error || 'DUO verificatie mislukt');
      }
    } catch (error) {
      console.error('DUO verification error:', error);
      toast.error('Fout bij DUO verificatie');
    } finally {
      setIsDuoVerifying(false);
    }
  };

  // Manual verification
  const handleManualVerification = async (documentType: 'vog' | 'diploma', verified: boolean) => {
    setIsManualVerifying(documentType);
    try {
      const { data, error } = await supabase.rpc('verify_document_manual', {
        p_application_id: applicationId,
        p_document_type: documentType,
        p_verified: verified,
        p_notes: `Handmatig ${verified ? 'goedgekeurd' : 'afgekeurd'} door recruiter`
      });

      if (error) throw error;

      toast.success(`Document ${verified ? 'goedgekeurd' : 'afgekeurd'}`);
      onStatusUpdate?.();
    } catch (error) {
      console.error('Manual verification error:', error);
      toast.error('Fout bij handmatige verificatie');
    } finally {
      setIsManualVerifying(null);
    }
  };

  // Calculate days remaining
  const getDaysRemaining = () => {
    if (!vogValidUntil) return null;
    const expiry = new Date(vogValidUntil);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* VOG Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${vogConfig.color}`}>
              <VogIcon className={`h-4 w-4 ${vogStatus === 'validating' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">VOG</span>
                <Badge variant="outline" className={`text-xs ${vogConfig.color}`}>
                  {vogConfig.label}
                </Badge>
                {vogSource && (
                  <span className="text-xs text-muted-foreground">
                    via {vogSource}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{vogConfig.description}</p>
              {daysRemaining !== null && vogStatus === 'authentic_ok' && (
                <p className={`text-xs ${daysRemaining <= 14 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {daysRemaining > 0 
                    ? `Nog ${daysRemaining} dagen geldig`
                    : 'Verlopen'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* GAAV Verify Button */}
            {vogFilePath && vogStatus !== 'authentic_ok' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGaavVerification}
                    disabled={isVerifying}
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>GAAV Verificatie uitvoeren</TooltipContent>
              </Tooltip>
            )}

            {/* Manual Verify Buttons */}
            {vogStatus !== 'authentic_ok' && vogStatus !== 'missing' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualVerification('vog', true)}
                      disabled={isManualVerifying === 'vog'}
                      className="text-green-600 hover:text-green-700"
                    >
                      {isManualVerifying === 'vog' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Handmatig goedkeuren</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualVerification('vog', false)}
                      disabled={isManualVerifying === 'vog'}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Handmatig afkeuren</TooltipContent>
                </Tooltip>
              </>
            )}

            {/* Re-verify button for already verified */}
            {vogStatus === 'authentic_ok' && vogFilePath && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGaavVerification}
                    disabled={isVerifying}
                  >
                    <RefreshCw className={`h-4 w-4 ${isVerifying ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Opnieuw verifiëren</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Diploma Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${diplomaConfig.color}`}>
              <DiplomaIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Diploma</span>
                <Badge variant="outline" className={`text-xs ${diplomaConfig.color}`}>
                  {diplomaConfig.label}
                </Badge>
                {diplomaSource && (
                  <span className="text-xs text-muted-foreground">
                    via {diplomaSource}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{diplomaConfig.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* DUO Verify Button */}
            {diplomaFilePath && !['verified_duo', 'verified_emrex', 'verified_manual'].includes(diplomaStatus) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDuoVerification}
                    disabled={isDuoVerifying}
                  >
                    {isDuoVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>DUO Verificatie uitvoeren</TooltipContent>
              </Tooltip>
            )}

            {/* Re-verify button for DUO verified or error */}
            {diplomaFilePath && (diplomaStatus === 'verified_duo' || diplomaStatus === 'duo_error') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDuoVerification}
                    disabled={isDuoVerifying}
                  >
                    <RefreshCw className={`h-4 w-4 ${isDuoVerifying ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Opnieuw DUO verifiëren</TooltipContent>
              </Tooltip>
            )}

            {/* Manual Verify Buttons for Diploma */}
            {diplomaStatus !== 'verified_emrex' && diplomaStatus !== 'verified_manual' && diplomaStatus !== 'verified_duo' && diplomaStatus !== 'missing' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualVerification('diploma', true)}
                      disabled={isManualVerifying === 'diploma'}
                      className="text-green-600 hover:text-green-700"
                    >
                      {isManualVerifying === 'diploma' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Handmatig goedkeuren</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualVerification('diploma', false)}
                      disabled={isManualVerifying === 'diploma'}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Handmatig afkeuren</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* GAAV Response Details (if available) */}
        {vogVerificationResponse && Object.keys(vogVerificationResponse).length > 0 && (
          <div className="p-2 rounded border bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">GAAV Verificatie Details</p>
            <div className="text-xs space-y-0.5">
              {vogVerificationResponse.gaav_code !== undefined && (
                <p>Code: {String(vogVerificationResponse.gaav_code)}</p>
              )}
              {vogVerificationResponse.gaav_description && (
                <p>{String(vogVerificationResponse.gaav_description)}</p>
              )}
              {vogVerificationResponse.verified_at && (
                <p className="text-muted-foreground">
                  Geverifieerd: {new Date(String(vogVerificationResponse.verified_at)).toLocaleString('nl-NL')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* DUO Verification Details (if available) */}
        {duoVerificationResult && Object.keys(duoVerificationResult).length > 0 && (
          <div className="p-2 rounded border bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">DUO Verificatie Details</p>
            <div className="text-xs space-y-0.5">
              {duoVerificationResult.diploma_name && (
                <p><span className="font-medium">Diploma:</span> {String(duoVerificationResult.diploma_name)}</p>
              )}
              {duoVerificationResult.institution && (
                <p><span className="font-medium">Instelling:</span> {String(duoVerificationResult.institution)}</p>
              )}
              {duoVerificationResult.graduation_date && (
                <p><span className="font-medium">Afstudeerdatum:</span> {String(duoVerificationResult.graduation_date)}</p>
              )}
              {duoVerificationResult.crebo_code && (
                <p><span className="font-medium">CREBO:</span> {String(duoVerificationResult.crebo_code)}</p>
              )}
              {duoVerificationResult.level && (
                <p><span className="font-medium">Niveau:</span> {String(duoVerificationResult.level)}</p>
              )}
              {duoVerificationResult.message && (
                <p className="text-muted-foreground">{String(duoVerificationResult.message)}</p>
              )}
              {duoVerifiedAt && (
                <p className="text-muted-foreground">
                  Geverifieerd: {new Date(duoVerifiedAt).toLocaleString('nl-NL')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

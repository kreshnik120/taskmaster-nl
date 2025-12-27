import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { 
  Upload, 
  Download, 
  Eye, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  History,
  FileText
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface AuditEntry {
  id: string;
  action: string;
  document_type: string;
  file_path: string | null;
  performed_at: string;
  performed_by: string;
  metadata: unknown;
}

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
}

interface DocumentAuditHistoryProps {
  applicationId: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  upload: { 
    icon: <Upload className="h-4 w-4" />, 
    color: 'bg-green-500/10 text-green-600 border-green-200',
    label: 'Geüpload'
  },
  download: { 
    icon: <Download className="h-4 w-4" />, 
    color: 'bg-blue-500/10 text-blue-600 border-blue-200',
    label: 'Gedownload'
  },
  preview: { 
    icon: <Eye className="h-4 w-4" />, 
    color: 'bg-gray-500/10 text-gray-600 border-gray-200',
    label: 'Bekeken (nieuw tabblad)'
  },
  inline_preview: { 
    icon: <Eye className="h-4 w-4" />, 
    color: 'bg-gray-500/10 text-gray-600 border-gray-200',
    label: 'Bekeken (inline)'
  },
  delete: { 
    icon: <Trash2 className="h-4 w-4" />, 
    color: 'bg-red-500/10 text-red-600 border-red-200',
    label: 'Verwijderd'
  }
};

const DOC_TYPE_LABELS: Record<string, string> = {
  cv: 'CV',
  vog: 'VOG',
  diploma: 'Diploma',
  beroepsaansprakelijkheid: 'Beroepsaansprakelijkheid',
  kvk_uittreksel: 'KvK Uittreksel',
  klachtenportaal_wkkgz: 'Klachtenportaal/WKKGZ',
  identiteitsbewijs: 'Identiteitsbewijs',
  bhv_certificaat: 'BHV Certificaat',
  tillift_certificaat: 'Tillift Certificaat',
  overig: 'Overig Certificaat'
};

export function DocumentAuditHistory({ applicationId }: DocumentAuditHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (isOpen && entries.length === 0) {
      fetchAuditHistory();
    }
  }, [isOpen, applicationId]);

  const fetchAuditHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('document_audit_logs')
        .select('*')
        .eq('application_id', applicationId)
        .order('performed_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setEntries(data || []);

      // Fetch user profiles for the performers
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(e => e.performed_by).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', userIds);

          if (profiles) {
            const profileMap: Record<string, UserProfile> = {};
            profiles.forEach(p => {
              profileMap[p.id] = p;
            });
            setUserProfiles(profileMap);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch audit history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionConfig = (action: string) => {
    return ACTION_CONFIG[action] || { 
      icon: <FileText className="h-4 w-4" />, 
      color: 'bg-gray-500/10 text-gray-600 border-gray-200',
      label: action 
    };
  };

  const getDocTypeLabel = (docType: string) => {
    return DOC_TYPE_LABELS[docType] || docType;
  };

  const getUserName = (userId: string) => {
    const profile = userProfiles[userId];
    if (profile?.name) return profile.name;
    if (profile?.email) return profile.email.split('@')[0];
    return 'Onbekend';
  };

  const getUserInitials = (userId: string) => {
    const name = getUserName(userId);
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Card className="mt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Document Historie
                {entries.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {entries.length}
                  </Badge>
                )}
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nog geen document acties gelogd
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {entries.map((entry) => {
                  const actionConfig = getActionConfig(entry.action);
                  return (
                    <div 
                      key={entry.id} 
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getUserInitials(entry.performed_by)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${actionConfig.color}`}
                          >
                            {actionConfig.icon}
                            <span className="ml-1">{actionConfig.label}</span>
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {getDocTypeLabel(entry.document_type)}
                          </Badge>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mt-1">
                          door <span className="font-medium">{getUserName(entry.performed_by)}</span>
                          {' • '}
                          {formatDistanceToNow(new Date(entry.performed_at), { 
                            addSuffix: true, 
                            locale: nl 
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

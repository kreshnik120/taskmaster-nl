import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, X, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useLinkProfessional } from "@/hooks/whatsapp/useLinkProfessional";

interface WhatsAppProfessionalDropdownProps {
  chatId: string;
  currentProfessionalId: string | null;
  currentProfessionalName?: string | null;
}

export function WhatsAppProfessionalDropdown({
  chatId,
  currentProfessionalId,
  currentProfessionalName,
}: WhatsAppProfessionalDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  const linkProfessional = useLinkProfessional();

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ['professionals-list', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('professionals')
        .select('id, full_name')
        .order('full_name', { ascending: true })
        .limit(50);

      if (searchQuery.trim()) {
        query = query.ilike('full_name', `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const handleLink = (professionalId: string) => {
    linkProfessional.mutate({ chatId, professionalId });
    setOpen(false);
  };

  const handleUnlink = () => {
    linkProfessional.mutate({ chatId, professionalId: null });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={currentProfessionalId ? "secondary" : "outline"} 
          size="sm" 
          className="gap-1.5"
          aria-label="Koppel aan professional"
        >
          <Link2 className="h-4 w-4" />
          {currentProfessionalId ? 'Gekoppeld' : 'Koppelen'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-background border shadow-lg z-50">
        {/* Search input */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek professional..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        
        <DropdownMenuSeparator />

        {/* Current linked professional */}
        {currentProfessionalId && currentProfessionalName && (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
              Momenteel gekoppeld
            </div>
            <DropdownMenuItem
              onClick={handleUnlink}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <X className="h-4 w-4" />
              {currentProfessionalName} ontkoppelen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Professional list */}
        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Laden...
            </div>
          ) : professionals.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Geen professionals gevonden
            </div>
          ) : (
            professionals.map((professional) => (
              <DropdownMenuItem
                key={professional.id}
                onClick={() => handleLink(professional.id)}
                className="gap-2"
                disabled={professional.id === currentProfessionalId}
              >
                {professional.id === currentProfessionalId && (
                  <Check className="h-4 w-4 text-[#25D366]" />
                )}
                <span className={professional.id === currentProfessionalId ? "font-medium" : ""}>
                  {professional.full_name}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { Link } from "react-router-dom";
import { User, Briefcase, LayoutDashboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLinkProfessional } from "@/hooks/whatsapp/useLinkProfessional";

interface WhatsAppLinkedBannerProps {
  chatId: string;
  professionalId: string;
  professionalName: string;
}

export function WhatsAppLinkedBanner({ 
  chatId, 
  professionalId, 
  professionalName 
}: WhatsAppLinkedBannerProps) {
  const linkProfessional = useLinkProfessional();

  const handleUnlink = () => {
    linkProfessional.mutate({ chatId, professionalId: null });
  };

  return (
    <div className="bg-[#25D366]/10 border-b border-[#25D366]/20 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        {/* Left side: Info */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-[#25D366]" />
          <span className="text-muted-foreground">Gekoppeld aan:</span>
          <span className="font-medium text-foreground">{professionalName}</span>
        </div>

        {/* Right side: Quick actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 hover:bg-[#25D366]/10"
            asChild
          >
            <Link to={`/professionals?id=${professionalId}`}>
              <User className="h-3.5 w-3.5" />
              Profiel
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 hover:bg-[#25D366]/10"
            asChild
          >
            <Link to={`/sollicitaties?professional=${professionalId}`}>
              <Briefcase className="h-3.5 w-3.5" />
              Sollicitaties
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 hover:bg-[#25D366]/10"
            asChild
          >
            <Link to={`/kanban?assignee=${professionalId}`}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              Kanban
            </Link>
          </Button>
          
          {/* Unlink button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleUnlink}
            aria-label="Professional ontkoppelen"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Link2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function QuickActionsHub() {
  const navigate = useNavigate();

  return (
    <Card className="backdrop-blur-sm border-white/50 dark:border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Snelle Acties
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            onClick={() => navigate("/sollicitaties")}
            className="w-full"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe Sollicitatie
          </Button>
          <Button
            onClick={() => navigate("/professionals")}
            className="w-full"
            variant="outline"
          >
            <Search className="h-4 w-4 mr-2" />
            Zoek Professional
          </Button>
          <Button
            onClick={() => navigate("/plaatsingen")}
            className="w-full"
            variant="outline"
          >
            <Link2 className="h-4 w-4 mr-2" />
            Match Starten
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

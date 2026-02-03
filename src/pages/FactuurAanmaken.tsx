import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function FactuurAanmaken() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/facturatie")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Nieuwe Factuur</h1>
      </div>

      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Placeholder voor factuur aanmaken wizard.
          </p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            Volledige implementatie komt in Deel 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

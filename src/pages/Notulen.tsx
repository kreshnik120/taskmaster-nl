import { PageHero } from "@/components/ui/page-hero";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function Notulen() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHero
        title="Vergadernotulen"
        subtitle="Beheer en archiveer vergadernotulen met actiepunten"
      />

      <Card>
        <CardContent className="p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Construction className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">
            Module in ontwikkeling
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            De Notulen module wordt momenteel gebouwd. 
            Binnenkort kun je hier vergadernotulen aanmaken, 
            deelnemers beheren en actiepunten toewijzen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

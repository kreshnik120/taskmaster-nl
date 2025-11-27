import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

const clientSchema = z.object({
  company: z.string().min(1, "Bedrijfsnaam is verplicht"),
  name: z.string().min(1, "Contactpersoon is verplicht"),
  org_id: z.string().min(1, "Organisatie is verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated: () => void;
}

// Hardcoded org IDs matching the database
const ORGANIZATIONS = [
  { id: "650e8400-e29b-41d4-a716-446655440000", name: "ABCzorg" },
  { id: "650e8400-e29b-41d4-a716-446655440001", name: "CitoZorg" },
];

const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"];
const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
const FUNCTIES = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];

export default function NewClientDialog({
  open,
  onOpenChange,
  onClientCreated,
}: NewClientDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [regios, setRegios] = useState<string[]>([]);
  const [newRegio, setNewRegio] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [doelgroepen, setDoelgroepen] = useState<string[]>([]);
  const [functies, setFuncties] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      company: "",
      name: "",
      org_id: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    },
  });

  const selectedOrgId = watch("org_id");
  
  const handleAddRegio = () => {
    if (newRegio.trim() && !regios.includes(newRegio.trim())) {
      setRegios([...regios, newRegio.trim()]);
      setNewRegio("");
    }
  };
  
  const handleRemoveRegio = (regio: string) => {
    setRegios(regios.filter(r => r !== regio));
  };
  
  const toggleSector = (sector: string) => {
    setSectors(prev => 
      prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
    );
  };
  
  const toggleDoelgroep = (doelgroep: string) => {
    setDoelgroepen(prev => 
      prev.includes(doelgroep) ? prev.filter(d => d !== doelgroep) : [...prev, doelgroep]
    );
  };
  
  const toggleFunctie = (functie: string) => {
    setFuncties(prev => 
      prev.includes(functie) ? prev.filter(f => f !== functie) : [...prev, functie]
    );
  };

  const onSubmit = async (data: ClientFormData) => {
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error("Niet ingelogd");
        return;
      }

      // Insert client with matching criteria
      const { error } = await supabase.from("clients").insert({
        company: data.company,
        name: data.name,
        org_id: data.org_id,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        regio: regios,
        sector: sectors,
        doelgroep: doelgroepen,
        gezochte_functies: functies,
      });

      if (error) throw error;

      toast.success("Klant succesvol toegevoegd");
      reset();
      setRegios([]);
      setSectors([]);
      setDoelgroepen([]);
      setFuncties([]);
      onClientCreated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating client:", error);
      toast.error("Kon klant niet toevoegen");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Klant Toevoegen</DialogTitle>
          <DialogDescription>
            Voeg een nieuwe klant toe met contactgegevens
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Bedrijfsinformatie */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Bedrijfsinformatie</h3>
            <div className="space-y-2">
              <Label htmlFor="company">
                Bedrijfsnaam <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company"
                {...register("company")}
                placeholder="Bijv. Zorgcentrum De Hof"
              />
              {errors.company && (
                <p className="text-sm text-destructive">{errors.company.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Contactpersoon <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Bijv. Jan Bakker"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
          </div>

          {/* Organisatie */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Organisatie</h3>
            <div className="space-y-2">
              <Label htmlFor="org_id">
                Organisatie <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedOrgId}
                onValueChange={(value) => setValue("org_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies organisatie" />
                </SelectTrigger>
                <SelectContent>
                  {ORGANIZATIONS.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.org_id && (
                <p className="text-sm text-destructive">{errors.org_id.message}</p>
              )}
            </div>
          </div>

          {/* Matching Criteria */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Matching Criteria</h3>
            
            {/* Regio's */}
            <div className="space-y-2">
              <Label>Regio's</Label>
              <div className="flex gap-2">
                <Input
                  value={newRegio}
                  onChange={(e) => setNewRegio(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRegio())}
                  placeholder="Bijv. Nijmegen, Utrecht..."
                />
                <Button type="button" onClick={handleAddRegio} variant="outline" size="sm">
                  +
                </Button>
              </div>
              {regios.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {regios.map((regio) => (
                    <Badge key={regio} variant="secondary" className="cursor-pointer">
                      {regio}
                      <X 
                        className="ml-1 h-3 w-3" 
                        onClick={() => handleRemoveRegio(regio)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Sector */}
            <div className="space-y-2">
              <Label>Sector</Label>
              <div className="flex flex-wrap gap-1.5">
                {SECTOREN.map((sector) => (
                  <Badge
                    key={sector}
                    variant={sectors.includes(sector) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleSector(sector)}
                  >
                    {sector}
                    {sectors.includes(sector) && <X className="ml-1 h-3 w-3" />}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Doelgroep */}
            <div className="space-y-2">
              <Label>Doelgroep</Label>
              <div className="flex flex-wrap gap-1.5">
                {DOELGROEPEN.map((dg) => (
                  <Badge
                    key={dg}
                    variant={doelgroepen.includes(dg) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleDoelgroep(dg)}
                  >
                    {dg}
                    {doelgroepen.includes(dg) && <X className="ml-1 h-3 w-3" />}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Gezochte functies */}
            <div className="space-y-2">
              <Label>Gezochte functies</Label>
              <div className="flex flex-wrap gap-1.5">
                {FUNCTIES.map((functie) => (
                  <Badge
                    key={functie}
                    variant={functies.includes(functie) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleFunctie(functie)}
                  >
                    {functie}
                    {functies.includes(functie) && <X className="ml-1 h-3 w-3" />}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Contactgegevens */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Contactgegevens</h3>
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="Bijv. contact@zorgcentrum.nl"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefoonnummer</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="Bijv. 06-12345678"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adres</Label>
              <Input
                id="address"
                {...register("address")}
                placeholder="Bijv. Hoofdstraat 123, 1234 AB Amsterdam"
              />
            </div>
          </div>

          {/* Overig */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Overig</h3>
            <div className="space-y-2">
              <Label htmlFor="notes">Notities</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Extra informatie over de klant..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Klant Toevoegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

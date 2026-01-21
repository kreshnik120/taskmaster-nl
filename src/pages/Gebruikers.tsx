import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { PageHero } from "@/components/ui/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, Shield, UserCog, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface UserWithRole {
  id: string;
  email: string;
  created_at: string;
  raw_user_meta_data: { name?: string };
  role: string | null;
}

const roleBadgeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }> = {
  admin: { label: "Admin", variant: "destructive", icon: <Shield className="h-3 w-3" /> },
  manager: { label: "Manager", variant: "default", icon: <UserCog className="h-3 w-3" /> },
  user: { label: "Gebruiker", variant: "secondary", icon: <User className="h-3 w-3" /> },
};

export default function Gebruikers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch users
  const { data: users, isLoading, error } = useQuery({
    queryKey: ["managed-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list_users" },
      });

      if (error) throw error;
      return data.users as UserWithRole[];
    },
  });

  // Assign role mutation
  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "assign_role", user_id: userId, role },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      setEditingUserId(null);
      toast.success(`Rol gewijzigd naar ${roleBadgeConfig[variables.role]?.label || variables.role}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon rol niet wijzigen");
    },
  });

  // Filter users
  const filteredUsers = users?.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    const name = user.raw_user_meta_data?.name?.toLowerCase() || "";
    const email = user.email.toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    assignRoleMutation.mutate({ userId, role: newRole });
  };

  return (
    <AdminOnly
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Shield className="h-16 w-16 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Geen toegang</h2>
          <p className="text-muted-foreground">Alleen admins kunnen gebruikers beheren.</p>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHero
          title="Gebruikers"
          subtitle="Beheer teamleden en hun rollen"
        />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg font-medium">
                Alle gebruikers ({filteredUsers?.length || 0})
              </CardTitle>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam of email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-destructive">
                Kon gebruikers niet laden. Probeer opnieuw.
              </div>
            ) : filteredUsers?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchTerm ? "Geen gebruikers gevonden" : "Nog geen gebruikers geregistreerd"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Geregistreerd</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="w-[180px]">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers?.map((user) => {
                    const roleConfig = roleBadgeConfig[user.role || ""] || {
                      label: user.role || "Geen rol",
                      variant: "secondary" as const,
                      icon: <User className="h-3 w-3" />,
                    };
                    const isEditing = editingUserId === user.id;

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.raw_user_meta_data?.name || "—"}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(user.created_at), "d MMM yyyy", { locale: nl })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleConfig.variant} className="gap-1">
                            {roleConfig.icon}
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              defaultValue={user.role || "user"}
                              onValueChange={(value) => handleRoleChange(user.id, value)}
                              disabled={assignRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Gebruiker</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingUserId(user.id)}
                            >
                              Rol wijzigen
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">📋 Onboarding instructies voor personeel</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Ga naar de login pagina en klik op "Registreren"</li>
              <li>Vul je naam, zakelijke email en een sterk wachtwoord in</li>
              <li>Na registratie heb je direct toegang met de "Gebruiker" rol</li>
              <li>Een admin kan je rol upgraden naar "Manager" voor extra rechten</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </AdminOnly>
  );
}

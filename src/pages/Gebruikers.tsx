import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { PageHero } from "@/components/ui/page-hero";
import { PageContainer } from "@/components/ui/page-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SecurityAuditWidget } from "@/components/users/SecurityAuditWidget";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Users, 
  Search, 
  Shield, 
  UserCog, 
  User, 
  Loader2, 
  UserPlus, 
  Mail, 
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  UserCheck,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
 } from "@/components/ui/alert-dialog";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface UserWithRole {
  id: string;
  email: string;
  created_at: string;
  raw_user_meta_data: { name?: string };
  role: string | null;
}

interface UserInvitation {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

const roleBadgeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }> = {
  admin: { label: "Admin", variant: "destructive", icon: <Shield className="h-3 w-3" /> },
  manager: { label: "Manager", variant: "default", icon: <UserCog className="h-3 w-3" /> },
  user: { label: "Gebruiker", variant: "secondary", icon: <User className="h-3 w-3" /> },
};

export default function Gebruikers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'user'>('user');
  const [impersonateTarget, setImpersonateTarget] = useState<{ id: string; email: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string; name: string } | null>(null);
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

  // Fetch pending invitations
  const { data: invitations, isLoading: invitationsLoading } = useQuery({
    queryKey: ["user-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as UserInvitation[];
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

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async ({ email, name, role }: { email: string; name?: string; role: 'admin' | 'manager' | 'user' }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, name, role },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.warning || 'Uitnodiging mislukt');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole('user');
      
      if (data.email_sent) {
        toast.success('Uitnodiging verzonden per e-mail!');
      } else {
        toast.warning('Uitnodiging aangemaakt, maar e-mail kon niet worden verzonden.');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon uitnodiging niet versturen");
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('user_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
      toast.success('Uitnodiging verwijderd');
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon uitnodiging niet verwijderen");
    },
  });

  // Filter users
  const filteredUsers = users?.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    const name = user.raw_user_meta_data?.name?.toLowerCase() || "";
    const email = user.email.toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  });

  // Filter invitations (pending only)
  const pendingInvitations = invitations?.filter((inv) => {
    return !inv.accepted_at && new Date(inv.expires_at) > new Date();
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    assignRoleMutation.mutate({ userId, role: newRole });
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) {
      toast.error('Vul een e-mailadres in');
      return;
    }
    inviteUserMutation.mutate({ 
      email: inviteEmail, 
      name: inviteName || undefined, 
      role: inviteRole 
    });
  };

   // Impersonate user mutation
   const impersonateMutation = useMutation({
     mutationFn: async (targetUserId: string) => {
       const { data: session } = await supabase.auth.getSession();
       
       const { data, error } = await supabase.functions.invoke("impersonate-user", {
         body: { action: "start_impersonation", target_user_id: targetUserId },
         headers: {
           Authorization: `Bearer ${session.session?.access_token}`,
         },
       });
 
       if (error) throw error;
       if (!data.success) throw new Error(data.error || 'Impersonatie mislukt');
       return data;
     },
     onSuccess: async (data) => {
       // Get current admin user ID
       const { data: { user } } = await supabase.auth.getUser();
       if (user) {
         // Store impersonation state
         localStorage.setItem('original_admin_id', user.id);
         localStorage.setItem('impersonating_as', data.target_email);
       }
       
       toast.success(`Bezig met inloggen als ${data.target_name}...`);
       
       // Redirect to magic link
       window.location.href = data.magic_link;
     },
     onError: (error: Error) => {
       toast.error(error.message || "Kon niet impersoneren");
       setImpersonateTarget(null);
     },
   });
 
   const handleImpersonateConfirm = () => {
     if (impersonateTarget) {
       impersonateMutation.mutate(impersonateTarget.id);
     }
   };

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "delete_user", user_id: userId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Verwijderen mislukt');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success(data.message || 'Gebruiker verwijderd');
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Kon gebruiker niet verwijderen");
      setDeleteTarget(null);
    },
  });

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteUserMutation.mutate(deleteTarget.id);
    }
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
      <PageContainer contextColor="violet" className="space-y-6">
        <PageHero
          title="Gebruikers"
          subtitle="Beheer teamleden en hun rollen"
        />

        {/* Invite Button + Dialog */}
        <div className="flex justify-end">
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Nieuwe Medewerker Uitnodigen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Medewerker Uitnodigen</DialogTitle>
                <DialogDescription>
                  Verstuur een uitnodiging per e-mail. De ontvanger kan dan een account aanmaken.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">E-mailadres *</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="naam@voorbeeld.nl"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Naam (optioneel)</Label>
                  <Input
                    id="invite-name"
                    type="text"
                    placeholder="Volledige naam"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Rol</Label>
                  <Select value={inviteRole} onValueChange={(v: 'admin' | 'manager' | 'user') => setInviteRole(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Gebruiker</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {inviteRole === 'admin' && 'Volledige toegang tot alle functies en gebruikersbeheer'}
                    {inviteRole === 'manager' && 'Kan taken beheren en rapporten bekijken'}
                    {inviteRole === 'user' && 'Standaard toegang voor dagelijkse taken'}
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>
                    Annuleren
                  </Button>
                  <Button type="submit" disabled={inviteUserMutation.isPending}>
                    {inviteUserMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Versturen...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Uitnodiging Versturen
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations && pendingInvitations.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Openstaande Uitnodigingen ({pendingInvitations.length})
              </CardTitle>
              <CardDescription>
                Deze uitnodigingen zijn nog niet geaccepteerd
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Verstuurd</TableHead>
                    <TableHead>Verloopt</TableHead>
                    <TableHead className="w-[100px]">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((invitation) => {
                    const roleConfig = roleBadgeConfig[invitation.role] || roleBadgeConfig.user;
                    const expiresAt = new Date(invitation.expires_at);
                    const isExpiringSoon = expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;
                    
                    return (
                      <TableRow key={invitation.id} className="table-row-hover-violet">
                        <TableCell className="font-medium">{invitation.email}</TableCell>
                        <TableCell>
                          <Badge variant={roleConfig.variant} className="gap-1">
                            {roleConfig.icon}
                            {roleConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true, locale: nl })}
                        </TableCell>
                        <TableCell className={isExpiringSoon ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                          {formatDistanceToNow(expiresAt, { addSuffix: true, locale: nl })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteInvitationMutation.mutate(invitation.id)}
                            disabled={deleteInvitationMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
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
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
                  {searchTerm ? (
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  ) : (
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  {searchTerm ? "Geen gebruikers gevonden" : "Nog geen medewerkers"}
                </h3>
                <p className="text-sm text-muted-foreground/70">
                  {searchTerm
                    ? `Geen resultaten voor "${searchTerm}"`
                    : "Klik op 'Nieuwe Medewerker Uitnodigen' om te beginnen"}
                </p>
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
                      <TableRow key={user.id} className="table-row-hover-violet">
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
                             <div className="flex items-center gap-1">
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => setEditingUserId(user.id)}
                               >
                                 Rol wijzigen
                               </Button>
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-8 w-8"
                                 onClick={() => setImpersonateTarget({
                                   id: user.id,
                                   email: user.email,
                                   name: user.raw_user_meta_data?.name || user.email
                                 })}
                                 title="Inloggen als deze gebruiker"
                               >
                                 <UserCheck className="h-4 w-4" />
                               </Button>
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-8 w-8 text-destructive hover:text-destructive"
                                 onClick={() => setDeleteTarget({
                                   id: user.id,
                                   email: user.email,
                                   name: user.raw_user_meta_data?.name || user.email
                                 })}
                                 title="Gebruiker verwijderen"
                               >
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                             </div>
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

        {/* Security Audit Widget */}
        <SecurityAuditWidget />

        {/* Info Card */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Beveiligde Registratie
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Nieuwe accounts kunnen alleen worden aangemaakt via uitnodigingen. Dit voorkomt ongeautoriseerde toegang.
            </p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <span>Klik op "Nieuwe Medewerker Uitnodigen" om iemand uit te nodigen</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <span>De ontvanger krijgt een e-mail met een unieke registratielink</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <span>De uitnodiging is 7 dagen geldig en kan maar één keer worden gebruikt</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <span>De toegewezen rol wordt automatisch toegepast na registratie</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <span>OAuth login (Google/GitHub) werkt alleen voor uitgenodigde gebruikers</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
       
       {/* Impersonation Confirmation Dialog */}
       <AlertDialog open={!!impersonateTarget} onOpenChange={(open) => !open && setImpersonateTarget(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Inloggen als andere gebruiker</AlertDialogTitle>
             <AlertDialogDescription>
               Je staat op het punt om in te loggen als{" "}
               <span className="font-semibold">{impersonateTarget?.name}</span>{" "}
               ({impersonateTarget?.email}).
               <br /><br />
               Je krijgt volledige toegang tot hun account. Een banner zal zichtbaar zijn zodat je weet dat je impersoneert.
               <br /><br />
               Deze actie wordt gelogd voor beveiligingsdoeleinden.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Annuleren</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleImpersonateConfirm}
               disabled={impersonateMutation.isPending}
             >
               {impersonateMutation.isPending ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Bezig...
                 </>
               ) : (
                 <>
                   <UserCheck className="mr-2 h-4 w-4" />
                   Inloggen als {impersonateTarget?.name?.split(' ')[0] || 'gebruiker'}
                 </>
               )}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

       {/* Delete User Confirmation Dialog */}
       <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Gebruiker definitief verwijderen</AlertDialogTitle>
             <AlertDialogDescription>
               Weet je zeker dat je{" "}
               <span className="font-semibold">{deleteTarget?.name}</span>{" "}
               ({deleteTarget?.email}) wilt verwijderen?
               <br /><br />
               Dit verwijdert het account en alle gerelateerde data permanent. Deze actie kan niet ongedaan worden gemaakt.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Annuleren</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleDeleteConfirm}
               disabled={deleteUserMutation.isPending}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {deleteUserMutation.isPending ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Verwijderen...
                 </>
               ) : (
                 <>
                   <Trash2 className="mr-2 h-4 w-4" />
                   Definitief verwijderen
                 </>
               )}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
    </AdminOnly>
  );
}

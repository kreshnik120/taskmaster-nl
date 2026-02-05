 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { supabase } from "@/integrations/supabase/client";
 import { AlertTriangle, LogOut } from "lucide-react";
 import { toast } from "sonner";
 
 export const ImpersonationBanner = () => {
   const [impersonatingAs, setImpersonatingAs] = useState<string | null>(null);
   const [originalAdminId, setOriginalAdminId] = useState<string | null>(null);
 
   useEffect(() => {
     // Check localStorage for impersonation state
     const storedImpersonating = localStorage.getItem('impersonating_as');
     const storedAdminId = localStorage.getItem('original_admin_id');
     
     if (storedImpersonating && storedAdminId) {
       setImpersonatingAs(storedImpersonating);
       setOriginalAdminId(storedAdminId);
     }
 
     // Listen for storage changes (in case of multi-tab)
     const handleStorageChange = (e: StorageEvent) => {
       if (e.key === 'impersonating_as') {
         setImpersonatingAs(e.newValue);
       }
       if (e.key === 'original_admin_id') {
         setOriginalAdminId(e.newValue);
       }
     };
 
     window.addEventListener('storage', handleStorageChange);
     return () => window.removeEventListener('storage', handleStorageChange);
   }, []);
 
   const handleStopImpersonation = async () => {
     try {
       // Get current session to log the stop action
       const { data: { session } } = await supabase.auth.getSession();
       
       if (session && originalAdminId) {
         // Log the stop action (fire and forget)
         await supabase.functions.invoke('impersonate-user', {
           body: {
             action: 'stop_impersonation',
             target_user_id: session.user.id
           }
         }).catch(() => {
           // Ignore errors, just proceed with logout
         });
       }
 
       // Clear impersonation state
       localStorage.removeItem('impersonating_as');
       localStorage.removeItem('original_admin_id');
       
       // Clear role cache to prevent stale data
       localStorage.removeItem('user_role_cache');
 
       // Sign out and redirect to login
       await supabase.auth.signOut();
       
       toast.success('Impersonatie beëindigd. Log opnieuw in als admin.');
       
       // Redirect to auth page
       window.location.href = '/auth';
     } catch (error) {
       console.error('Error stopping impersonation:', error);
       // Force redirect anyway
       localStorage.removeItem('impersonating_as');
       localStorage.removeItem('original_admin_id');
       localStorage.removeItem('user_role_cache');
       window.location.href = '/auth';
     }
   };
 
   // Don't render if not impersonating
   if (!impersonatingAs) {
     return null;
   }
 
   return (
     <div className="sticky top-0 z-[100] w-full bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground px-4 py-2 shadow-lg">
       <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
         <div className="flex items-center gap-3">
           <AlertTriangle className="h-5 w-5 animate-pulse" />
           <span className="font-medium text-sm sm:text-base">
             Je bekijkt de app als{" "}
             <span className="font-bold">{impersonatingAs}</span>
           </span>
         </div>
         <Button
           variant="secondary"
           size="sm"
           onClick={handleStopImpersonation}
           className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30"
         >
           <LogOut className="h-4 w-4" />
           <span className="hidden sm:inline">Stop Impersonatie</span>
           <span className="sm:hidden">Stop</span>
         </Button>
       </div>
     </div>
   );
 };
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const translateAuthError = (error: any): string => {
  console.log("🔍 Supabase error:", error);
  
  const errorMsg = error?.message?.toLowerCase() || "";
  
  // Common Supabase auth errors
  if (errorMsg.includes("invalid login credentials") || errorMsg.includes("invalid credentials")) {
    return "Onjuist e-mailadres of wachtwoord";
  }
  if (errorMsg.includes("user already registered")) {
    return "Dit e-mailadres is al geregistreerd. Probeer in te loggen.";
  }
  if (errorMsg.includes("email not confirmed")) {
    return "Je e-mailadres is nog niet bevestigd. Check je inbox.";
  }
  if (errorMsg.includes("password should be at least")) {
    return "Wachtwoord moet minimaal 6 tekens bevatten";
  }
  if (errorMsg.includes("invalid email")) {
    return "Ongeldig e-mailadres";
  }
  if (errorMsg.includes("email rate limit exceeded")) {
    return "Te veel pogingen. Probeer het later opnieuw.";
  }
  if (errorMsg.includes("user not found")) {
    return "Geen account gevonden met dit e-mailadres";
  }
  
  return error?.message || "Er ging iets mis. Probeer het opnieuw.";
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const navigate = useNavigate();

  const checkBackendHealth = async () => {
    if (!navigator.onLine) return;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
        { method: 'GET', signal: AbortSignal.timeout(3000) }
      );
      setBackendOffline(!response.ok);
    } catch {
      setBackendOffline(true);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast.success("Account aangemaakt! Je kunt nu inloggen.");
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Welkom terug!");
      navigate("/");
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Vul je e-mailadres in");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;

      toast.success("Check je inbox voor de wachtwoord reset link!");
      setResetMode(false);
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">TaskFlow</CardTitle>
          <CardDescription>Beheer je taken efficiënt</CardDescription>
        </CardHeader>
        <CardContent>
          {backendOffline && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Backend tijdelijk niet bereikbaar</AlertTitle>
              <AlertDescription>
                De verbinding met de backend is verbroken. Probeer het later opnieuw.
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 mt-2"
                  onClick={checkBackendHealth}
                >
                  Opnieuw proberen
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Inloggen</TabsTrigger>
              <TabsTrigger value="signup">Registreren</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              {resetMode ? (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">E-mailadres</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="naam@voorbeeld.nl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Versturen...
                      </>
                    ) : (
                      "Wachtwoord reset link versturen"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setResetMode(false)}
                  >
                    Terug naar inloggen
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mailadres</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="naam@voorbeeld.nl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Wachtwoord</Label>
                      <button
                        type="button"
                        onClick={() => setResetMode(true)}
                        className="text-sm text-primary hover:underline"
                      >
                        Wachtwoord vergeten?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Inloggen...
                      </>
                    ) : (
                      "Inloggen"
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Naam</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Je naam"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">E-mailadres</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="naam@voorbeeld.nl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Wachtwoord</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Account aanmaken...
                    </>
                  ) : (
                    "Account aanmaken"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
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
  
  // Network and timeout errors
  if (errorMsg.includes("failed to fetch") || 
      errorMsg.includes("networkerror") || 
      errorMsg.includes("request timeout") ||
      error?.name === "AbortError") {
    return "De backend is tijdelijk niet bereikbaar. Probeer het later opnieuw.";
  }
  
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
  const [healthCheckAttempts, setHealthCheckAttempts] = useState(0);
  const [backoffInterval, setBackoffInterval] = useState(10000);
  const [lastHealthCheck, setLastHealthCheck] = useState<{
    timestamp: Date;
    success: boolean;
    error?: string;
  } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const navigate = useNavigate();

  const checkBackendHealth = async () => {
    if (!navigator.onLine) {
      setBackendOffline(true);
      setHealthCheckAttempts(0);
      setLastHealthCheck({
        timestamp: new Date(),
        success: false,
        error: 'Browser offline'
      });
      return;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
        { 
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
          }
        }
      );
      
      clearTimeout(timeoutId);
      setBackendOffline(false);
      setHealthCheckAttempts(0);
      setBackoffInterval(10000);
      setLastHealthCheck({
        timestamp: new Date(),
        success: true
      });
      console.log('[Backend Health] ✅ Backend bereikbaar');
    } catch (error: any) {
      const errorMsg = error.name === 'AbortError' ? 'Timeout (8s)' : error.message;
      const newAttempts = healthCheckAttempts + 1;
      setHealthCheckAttempts(newAttempts);
      
      setLastHealthCheck({
        timestamp: new Date(),
        success: false,
        error: errorMsg
      });
      
      if (newAttempts >= 2) {
        console.warn(`[Backend Health] ❌ Backend niet bereikbaar na ${newAttempts} pogingen`);
        setBackendOffline(true);
        
        // Exponential backoff: 10s -> 20s -> 40s -> 80s -> 120s (max)
        const newInterval = Math.min(backoffInterval * 2, 120000);
        setBackoffInterval(newInterval);
        console.log(`[Backend Health] Next retry in ${newInterval / 1000}s`);
      }
    }
  };

  const enableDemoMode = () => {
    const mockSession = {
      user: {
        id: 'demo-user',
        email: 'demo@example.com',
        user_metadata: { name: 'Demo Gebruiker' }
      },
      access_token: 'demo-token',
      expires_at: Date.now() + 3600000
    };
    localStorage.setItem('demo-session', JSON.stringify(mockSession));
    setDemoMode(true);
    toast.success('Demo modus geactiveerd - Alleen UI demonstratie!');
    navigate('/');
  };

  useEffect(() => {
    checkBackendHealth();
    
    let retryInterval: NodeJS.Timeout;
    if (backendOffline) {
      console.log(`[Backend Health] Setting retry interval: ${backoffInterval / 1000}s`);
      retryInterval = setInterval(() => {
        checkBackendHealth();
      }, backoffInterval);
    }
    
    return () => clearInterval(retryInterval);
  }, [backendOffline, backoffInterval]);

  // Handle browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Network] Browser is online, checking backend...');
      checkBackendHealth();
    };

    const handleOffline = () => {
      console.log('[Network] Browser is offline');
      setBackendOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        }),
        10000
      );

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
    
    if (backendOffline) {
      toast.error("Backend is tijdelijk niet bereikbaar. Probeer eerst 'Opnieuw proberen'.");
      return;
    }
    
    setLoading(true);

    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        8000
      );

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
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        }),
        8000
      );

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
              <AlertDescription className="flex flex-col gap-2">
                <span>De verbinding met de backend is verbroken. Dit kan komen door:</span>
                <ul className="list-disc list-inside text-sm">
                  <li>Traag internet</li>
                  <li>Tijdelijke server onderhoud</li>
                  <li>Firewall of netwerk blokkade</li>
                </ul>
                
                {lastHealthCheck && (
                  <div className="mt-2 p-2 bg-muted rounded-md text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Laatste controle:</span>
                      <span>{lastHealthCheck.timestamp.toLocaleTimeString('nl-NL')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Status:</span>
                      <span className={lastHealthCheck.success ? 'text-green-600' : 'text-red-600'}>
                        {lastHealthCheck.success ? '✅ Online' : '❌ Offline'}
                      </span>
                    </div>
                    {lastHealthCheck.error && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Fout:</span>
                        <span className="text-red-600">{lastHealthCheck.error}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Volgende poging:</span>
                      <span>{backoffInterval / 1000}s</span>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setHealthCheckAttempts(0);
                        setBackoffInterval(10000);
                        await checkBackendHealth();
                      }}
                    >
                      Opnieuw proberen
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBackendOffline(false)}
                    >
                      Negeren
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={enableDemoMode}
                    className="w-full"
                  >
                    🎨 Demo modus (alleen UI)
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Demo modus: Bekijk de UI zonder backend. Geen data wordt opgeslagen.
                  </p>
                </div>
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
                  <Button type="submit" className="w-full" disabled={loading || backendOffline}>
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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Translate common Supabase authentication errors to Dutch.
 */
const translateAuthError = (error: any): string => {
  console.log("🔍 Supabase error:", error);

  const errorMsg = error?.message?.toLowerCase() || "";

  // Network and timeout errors
  if (
    errorMsg.includes("failed to fetch") ||
    errorMsg.includes("networkerror") ||
    errorMsg.includes("request timeout") ||
    error?.name === "AbortError"
  ) {
    return "De backend is tijdelijk niet bereikbaar. Probeer het later opnieuw.";
  }

  // Common Supabase auth errors
  if (
    errorMsg.includes("invalid login credentials") ||
    errorMsg.includes("invalid credentials")
  ) {
    return "Onjuist e‑mailadres of wachtwoord";
  }
  if (errorMsg.includes("user already registered")) {
    return "Dit e‑mailadres is al geregistreerd. Probeer in te loggen.";
  }
  if (errorMsg.includes("email not confirmed")) {
    return "Je e‑mailadres is nog niet bevestigd. Check je inbox.";
  }
  if (errorMsg.includes("password should be at least")) {
    return "Wachtwoord moet minimaal 6 tekens bevatten";
  }
  if (errorMsg.includes("invalid email")) {
    return "Ongeldig e‑mailadres";
  }
  if (errorMsg.includes("email rate limit exceeded")) {
    return "Te veel pogingen. Probeer het later opnieuw.";
  }
  if (errorMsg.includes("user not found")) {
    return "Geen account gevonden met dit e‑mailadres";
  }
  // OAuth provider mismatch
  if (
    errorMsg.includes("sign in using the same provider") ||
    errorMsg.includes("other sign in method") ||
    errorMsg.includes("existing provider")
  ) {
    return "Je hebt je aangemeld met een andere provider (bijv. GitHub of Google). Gebruik dezelfde provider om in te loggen.";
  }

  // Fallback
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
  const [lastHealthCheck, setLastHealthCheck] = useState<{
    timestamp: Date;
    success: boolean;
    error?: string;
    duration?: number;
  } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [forceLoginAttempt, setForceLoginAttempt] = useState(false);
  const navigate = useNavigate();

  const checkBackendHealth = async () => {
    const startTime = Date.now();
    console.info('[AUTH][HEALTH] Starting check...', { timestamp: new Date().toISOString() });

    if (!navigator.onLine) {
      console.info('[AUTH][HEALTH] Browser offline detected');
      setBackendOffline(true);
      setHealthCheckAttempts(0);
      setLastHealthCheck({
        timestamp: new Date(),
        success: false,
        error: 'Browser offline',
        duration: 0,
      });
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
        {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      console.info('[AUTH][HEALTH] ✅ Success', { duration: `${duration}ms`, status: response.status });

      setBackendOffline(false);
      setHealthCheckAttempts(0);
      setLastHealthCheck({
        timestamp: new Date(),
        success: true,
        duration,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error.name === 'AbortError' ? 'Timeout (3s)' : error.message;
      const newAttempts = healthCheckAttempts + 1;

      console.warn('[AUTH][HEALTH] ❌ Failed', {
        attempt: newAttempts,
        duration: `${duration}ms`,
        error: errorMsg,
        type: error.name,
      });

      setHealthCheckAttempts(newAttempts);
      setLastHealthCheck({
        timestamp: new Date(),
        success: false,
        error: errorMsg,
        duration,
      });

      if (newAttempts >= 2) {
        setBackendOffline(true);
      }
    }
  };

  const scheduleNextHealthCheck = () => {
    const delay = Math.min(3000 * Math.pow(2, healthCheckAttempts), 60000);
    console.info('[AUTH][HEALTH] Next check scheduled in', { delay: `${delay / 1000}s` });

    setTimeout(async () => {
      await checkBackendHealth();
      scheduleNextHealthCheck();
    }, delay);
  };

  const enableDemoMode = () => {
    const mockSession = {
      user: {
        id: 'demo-user',
        email: 'demo@example.com',
        user_metadata: { name: 'Demo Gebruiker' },
      },
      access_token: 'demo-token',
      expires_at: Date.now() + 3600000,
    };
    localStorage.setItem('demo-session', JSON.stringify(mockSession));
    setDemoMode(true);
    toast.success('Demo modus geactiveerd - Alleen UI demonstratie!');
    navigate('/');
  };

  useEffect(() => {
    checkBackendHealth();
    scheduleNextHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        10000,
      );

      if (error) throw error;

      toast.success('Account aangemaakt! Je kunt nu inloggen.');
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (backendOffline && !forceLoginAttempt) {
      toast.error(
        "Backend is tijdelijk niet bereikbaar. Gebruik 'Toch inloggen proberen' om het toch te proberen.",
      );
      return;
    }

    setLoading(true);
    console.info('[AUTH] Login attempt started', { email, forced: forceLoginAttempt });

    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        8000,
      );

      if (error) throw error;

      toast.success('Welkom terug!');
      navigate('/');
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vul je e‑mailadres in');
      return;
    }

    setLoading(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        }),
        8000,
      );

      if (error) throw error;

      toast.success('Check je inbox voor de wachtwoordreset link!');
      setResetMode(false);
    } catch (error: any) {
      toast.error(translateAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
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
              <AlertTitle>Backend Offline</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span className="font-semibold">De backend is tijdelijk niet bereikbaar.</span>
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
                    {lastHealthCheck.duration !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Duur:</span>
                        <span>{lastHealthCheck.duration}ms</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setHealthCheckAttempts(0);
                        await checkBackendHealth();
                      }}
                    >
                      Opnieuw proberen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setForceLoginAttempt(true);
                        setBackendOffline(false);
                        toast.info("Je kunt nu inloggen proberen ondanks de offline status");
                      }}
                    >
                      Toch inloggen proberen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/diagnostics')}
                    >
                      📊 Diagnostics
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
                    <Label htmlFor="reset-email">E‑mailadres</Label>
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
                      'Wachtwoord reset link versturen'
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
                    <Label htmlFor="email">E‑mailadres</Label>
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
                    <Label htmlFor="password">Wachtwoord</Label>
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
                      'Inloggen'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setResetMode(true)}
                  >
                    Wachtwoord vergeten?
                  </Button>
                  
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Of login met
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOAuthLogin('google')}
                      disabled={loading}
                    >
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOAuthLogin('github')}
                      disabled={loading}
                    >
                      GitHub
                    </Button>
                  </div>
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
                  <Label htmlFor="signup-email">E‑mailadres</Label>
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
                      Registreren...
                    </>
                  ) : (
                    'Account aanmaken'
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

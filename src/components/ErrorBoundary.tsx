import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isChunkError: boolean;
  autoRefreshCountdown: number | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private countdownInterval?: NodeJS.Timeout;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isChunkError: false,
    autoRefreshCountdown: null,
  };

  private isChunkLoadingError(error: Error): boolean {
    const message = error.message || '';
    return (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('Loading CSS chunk') ||
      message.includes('ChunkLoadError')
    );
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    const isChunkError = this.isChunkLoadingError(error);
    
    this.setState({
      error,
      errorInfo,
      isChunkError,
      autoRefreshCountdown: isChunkError ? 3 : null,
    });

    // Auto-refresh for chunk errors
    if (isChunkError) {
      this.startAutoRefreshCountdown();
    }
  }

  private startAutoRefreshCountdown = () => {
    this.countdownInterval = setInterval(() => {
      this.setState((prev) => {
        if (prev.autoRefreshCountdown === null || prev.autoRefreshCountdown <= 1) {
          window.location.reload();
          return prev;
        }
        return { ...prev, autoRefreshCountdown: prev.autoRefreshCountdown - 1 };
      });
    }, 1000);
  };

  public componentWillUnmount() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  private handleReset = () => {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false, autoRefreshCountdown: null });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      // Special UI for chunk loading errors
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
              <CardHeader>
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-12 w-12 text-primary animate-spin" />
                  <CardTitle className="text-xl">
                    Nieuwe versie beschikbaar
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Er is een update geïnstalleerd. De pagina wordt automatisch herladen.
                </p>
                
                {this.state.autoRefreshCountdown !== null && (
                  <p className="text-sm text-muted-foreground">
                    Automatisch herladen over {this.state.autoRefreshCountdown} seconden...
                  </p>
                )}

                <Button onClick={this.handleRefresh} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Pagina Herladen
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      }

      // Standard error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <CardTitle className="text-2xl">
                  {this.props.fallbackTitle || 'Er ging iets mis'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Runtime Error</AlertTitle>
                <AlertDescription>
                  De applicatie liep tegen een onverwachte fout aan.
                </AlertDescription>
              </Alert>

              {this.state.error && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Foutmelding:</p>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40">
                    {this.state.error.toString()}
                  </pre>
                </div>
              )}

              {this.state.errorInfo && (
                <details className="space-y-2">
                  <summary className="text-sm font-semibold cursor-pointer hover:underline">
                    Component Stack (voor developers)
                  </summary>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={this.handleReset} variant="default">
                  Probeer Opnieuw
                </Button>
                <Button 
                  onClick={() => window.location.href = '/'} 
                  variant="outline"
                >
                  Terug naar Home
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Als dit probleem aanhoudt, neem dan contact op met support met de bovenstaande foutmelding.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

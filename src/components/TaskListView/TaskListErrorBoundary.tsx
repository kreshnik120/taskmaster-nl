import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TaskListErrorBoundaryProps {
  children: ReactNode;
}

interface TaskListErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for TaskListView
 * Catches rendering errors and displays a user-friendly error message
 */
export class TaskListErrorBoundary extends Component<
  TaskListErrorBoundaryProps,
  TaskListErrorBoundaryState
> {
  constructor(props: TaskListErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TaskListErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('TaskListView Error:', error, errorInfo);
  }

  handleRefresh = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div 
          className="flex flex-col items-center justify-center py-16 px-4 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Er ging iets mis
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            Er is een fout opgetreden bij het laden van de taken.
            Probeer de pagina te vernieuwen.
          </p>
          <Button onClick={this.handleRefresh} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Vernieuwen
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

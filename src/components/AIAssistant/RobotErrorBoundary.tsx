import React, { Component, ReactNode } from 'react';
import { Bot, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

export class RobotErrorBoundary extends Component<Props, State> {
  private resetTimeout?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(_: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🔴 3D Robot error:', error.message);
    console.debug('Error details:', errorInfo);
    
    // Increment error count
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    
    // Notify parent
    this.props.onError?.(error);
    
    // Auto-reset after 5 seconds if error count is low (< 3)
    if (this.state.errorCount < 3) {
      this.resetTimeout = setTimeout(() => {
        console.log('🔄 Attempting error boundary reset...');
        this.setState({ hasError: false });
      }, 5000);
    }
  }

  componentWillUnmount() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      // Permanent failure after 3+ errors
      if (this.state.errorCount >= 3) {
        return (
          <div className="w-32 h-32 flex flex-col items-center justify-center rounded-2xl bg-destructive/10 backdrop-blur-sm border border-destructive/30 p-4">
            <AlertTriangle className="w-8 h-8 text-destructive mb-2" />
            <span className="text-xs text-center text-muted-foreground">3D niet beschikbaar</span>
          </div>
        );
      }

      // Temporary fallback with retry
      return this.props.fallback || (
        <div className="w-32 h-32 flex items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/30">
          <Bot className="w-16 h-16 text-primary" />
        </div>
      );
    }

    return this.props.children;
  }
}

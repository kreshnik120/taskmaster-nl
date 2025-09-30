import React, { Component, ReactNode } from 'react';
import { Bot } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class RobotErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('3D Robot rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-32 h-32 flex items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/30">
          <Bot className="w-16 h-16 text-primary" />
        </div>
      );
    }

    return this.props.children;
  }
}

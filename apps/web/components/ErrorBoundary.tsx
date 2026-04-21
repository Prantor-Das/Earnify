"use client";

import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
  resetKey?: string | number | null;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("UI boundary captured an error", {
      error,
      componentStack: errorInfo.componentStack
    });

    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({
        hasError: false,
        error: null
      });
    }
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (typeof this.props.fallback === "function") {
      return this.props.fallback(this.state.error);
    }

    return this.props.fallback;
  }
}

export { ErrorBoundary };

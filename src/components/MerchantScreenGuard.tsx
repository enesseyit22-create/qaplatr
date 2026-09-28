import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BusinessPendingScreen } from '@/components/BusinessPendingScreen';

export class MerchantScreenGuard extends Component<
  { children: ReactNode; onBack: () => void },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Merchant panel crash', error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return <BusinessPendingScreen onBack={this.props.onBack} />;
    }
    return this.props.children;
  }
}

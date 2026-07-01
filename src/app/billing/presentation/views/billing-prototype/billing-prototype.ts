import { Component, computed, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

type PlanId = 'base' | 'operations' | 'compliance';
type CheckoutState = 'idle' | 'checkout' | 'success' | 'portal';

interface PlanOption {
  id: PlanId;
  name: string;
  price: string;
  description: string;
  cta: string;
  highlighted: boolean;
  features: string[];
  limits: string[];
}

interface UsageLimit {
  label: string;
  used: number;
  limit: number;
}

interface LockedFeature {
  name: string;
  reason: string;
  requiredPlan: string;
}

@Component({
  selector: 'app-billing-prototype',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './billing-prototype.html',
  styleUrl: './billing-prototype.css',
})
export class BillingPrototype {
  protected readonly currentPlanId = signal<PlanId>('operations');
  protected readonly selectedPlanId = signal<PlanId>('compliance');
  protected readonly checkoutState = signal<CheckoutState>('idle');

  protected readonly plans: PlanOption[] = [
    {
      id: 'base',
      name: 'Base',
      price: 'Free',
      description: 'For small teams validating cold-chain monitoring.',
      cta: 'Start free',
      highlighted: false,
      features: ['Asset monitoring', 'Incident list', 'Daily log'],
      limits: ['1 site', '5 assets', '2 users'],
    },
    {
      id: 'operations',
      name: 'Operations',
      price: 'US$29/mo',
      description: 'For active operations with several assets and staff.',
      cta: 'Current plan',
      highlighted: true,
      features: ['Multi-site dashboard', 'Preventive maintenance', 'CSV reports'],
      limits: ['3 sites', '30 assets', '12 users'],
    },
    {
      id: 'compliance',
      name: 'Compliance AI',
      price: 'US$79/mo',
      description: 'For audit-heavy teams that need AI guidance and summaries.',
      cta: 'Upgrade',
      highlighted: false,
      features: ['AI incident plans', 'AI compliance summary', 'Advanced audit trail'],
      limits: ['Unlimited sites', '120 assets', '40 users'],
    },
  ];

  protected readonly usage: UsageLimit[] = [
    { label: 'Sites', used: 2, limit: 3 },
    { label: 'Assets', used: 24, limit: 30 },
    { label: 'Users', used: 9, limit: 12 },
    { label: 'AI summaries', used: 0, limit: 0 },
  ];

  protected readonly lockedFeatures: LockedFeature[] = [
    {
      name: 'AI incident resolution plan',
      reason: 'AI Guidance is only available in Compliance AI.',
      requiredPlan: 'Compliance AI',
    },
    {
      name: 'AI compliance summary',
      reason: 'Report interpretation requires the AI entitlement.',
      requiredPlan: 'Compliance AI',
    },
    {
      name: 'More than 30 assets',
      reason: 'The Operations plan is close to its asset limit.',
      requiredPlan: 'Compliance AI',
    },
  ];

  protected readonly currentPlan = computed(
    () => this.plans.find((plan) => plan.id === this.currentPlanId()) ?? this.plans[0],
  );
  protected readonly selectedPlan = computed(
    () => this.plans.find((plan) => plan.id === this.selectedPlanId()) ?? this.plans[0],
  );
  protected readonly checkoutMessage = computed(() => {
    switch (this.checkoutState()) {
      case 'checkout':
        return `Stripe Checkout session ready for ${this.selectedPlan().name}.`;
      case 'success':
        return `${this.selectedPlan().name} payment confirmed. Webhook synchronization would activate entitlements.`;
      case 'portal':
        return 'Customer Portal session ready for payment method, invoices, and cancellation management.';
      default:
        return 'Select a plan or billing action to preview the operator flow.';
    }
  });

  protected selectPlan(planId: PlanId): void {
    this.selectedPlanId.set(planId);
    this.checkoutState.set('idle');
  }

  protected startCheckout(planId = this.selectedPlanId()): void {
    this.selectedPlanId.set(planId);
    this.checkoutState.set('checkout');
  }

  protected confirmWebhook(): void {
    this.currentPlanId.set(this.selectedPlanId());
    this.checkoutState.set('success');
  }

  protected openPortal(): void {
    this.checkoutState.set('portal');
  }

  protected usagePercent(item: UsageLimit): number {
    if (item.limit === 0) {
      return 100;
    }

    return Math.min(Math.round((item.used / item.limit) * 100), 100);
  }
}

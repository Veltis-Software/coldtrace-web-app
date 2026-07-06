import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { BillingApi } from '../../../infrastructure/billing-api';
import {
  OrganizationEntitlementResource,
  OrganizationSubscriptionResource,
  SubscriptionPlanResource,
} from '../../../infrastructure/billing-response';

type StatusKind = 'neutral' | 'success' | 'warning' | 'error';

interface UsageItem {
  label: string;
  used: number;
  limit: number | null;
  unit: string;
}

interface PlanLimitItem {
  label: string;
  value: string;
}

interface FeatureFlagItem {
  label: string;
  enabled: boolean;
}

@Component({
  selector: 'app-billing-prototype',
  standalone: true,
  imports: [MatIcon, RouterLink, TranslatePipe],
  templateUrl: './billing-prototype.html',
  styleUrl: './billing-prototype.css',
})
export class BillingPrototype implements OnInit {
  private readonly billingApi = inject(BillingApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly checkoutPlanCode = signal<string | null>(null);
  protected readonly portalLoading = signal(false);
  protected readonly plans = signal<SubscriptionPlanResource[]>([]);
  protected readonly subscription = signal<OrganizationSubscriptionResource | null>(null);
  protected readonly statusMessage = signal('Loading billing information from ColdTrace.');
  protected readonly statusKind = signal<StatusKind>('neutral');
  protected readonly errorMessage = signal('');

  protected readonly visiblePlans = computed(() =>
    this.plans()
      .filter((plan) => plan.visible)
      .sort((first, second) => first.monthlyPriceCents - second.monthlyPriceCents),
  );

  protected readonly currentPlanCode = computed(() => this.subscription()?.plan.code ?? '');

  protected readonly usageItems = computed<UsageItem[]>(() => {
    const subscription = this.subscription();

    if (!subscription) {
      return [];
    }

    return [
      {
        label: 'Locations',
        used: subscription.usage.locations,
        limit: subscription.plan.usageLimits.maxLocations,
        unit: 'sites',
      },
      {
        label: 'Assets',
        used: subscription.usage.assets,
        limit: subscription.plan.usageLimits.maxAssets,
        unit: 'assets',
      },
      {
        label: 'IoT devices',
        used: subscription.usage.iotDevices,
        limit: subscription.plan.usageLimits.maxIotDevices,
        unit: 'devices',
      },
      {
        label: 'Users',
        used: subscription.usage.users,
        limit: subscription.plan.usageLimits.maxUsers,
        unit: 'users',
      },
    ];
  });

  protected readonly enabledEntitlements = computed(() =>
    this.subscription()?.entitlements.filter((entitlement) => entitlement.enabled) ?? [],
  );

  protected readonly lockedEntitlements = computed(() =>
    this.subscription()?.entitlements.filter((entitlement) => !entitlement.enabled) ?? [],
  );

  protected readonly canOpenPortal = computed(() => !!this.subscription()?.providerCustomerId);

  ngOnInit(): void {
    this.prepareReturnMessage();
    this.loadBilling();
  }

  protected loadBilling(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      plans: this.billingApi.getSubscriptionPlans(),
      subscription: this.billingApi.getCurrentSubscription(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ plans, subscription }) => {
          this.plans.set(plans);
          this.subscription.set(subscription);

          if (!this.route.snapshot.queryParamMap.has('checkout')) {
            this.statusKind.set('neutral');
            this.statusMessage.set('Billing data is synchronized with the backend subscription state.');
          }
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.errorTextFrom(error));
          this.statusKind.set('error');
          this.statusMessage.set('Billing information is unavailable right now.');
        },
      });
  }

  protected startCheckout(plan: SubscriptionPlanResource): void {
    if (this.isPlanActionDisabled(plan)) {
      return;
    }

    this.checkoutPlanCode.set(plan.code);
    this.errorMessage.set('');
    this.statusKind.set('neutral');
    this.statusMessage.set(`Creating Stripe Checkout session for ${plan.displayName}.`);

    this.billingApi
      .createCheckoutSession(plan.code)
      .pipe(finalize(() => this.checkoutPlanCode.set(null)))
      .subscribe({
        next: (session) => {
          if (!session.checkoutUrl) {
            this.statusKind.set('error');
            this.statusMessage.set('The checkout session did not include a redirect URL.');
            return;
          }

          window.location.assign(session.checkoutUrl);
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.errorTextFrom(error));
          this.statusKind.set('error');
          this.statusMessage.set('Checkout could not be started.');
        },
      });
  }

  protected openPortal(): void {
    if (!this.canOpenPortal()) {
      this.statusKind.set('warning');
      this.statusMessage.set('Customer Portal is available after the organization has a Stripe customer.');
      return;
    }

    this.portalLoading.set(true);
    this.errorMessage.set('');
    this.statusKind.set('neutral');
    this.statusMessage.set('Opening Stripe Customer Portal.');

    this.billingApi
      .createPortalSession()
      .pipe(finalize(() => this.portalLoading.set(false)))
      .subscribe({
        next: (session) => {
          if (!session.portalUrl) {
            this.statusKind.set('error');
            this.statusMessage.set('The portal session did not include a redirect URL.');
            return;
          }

          window.location.assign(session.portalUrl);
        },
        error: (error: unknown) => {
          this.errorMessage.set(this.errorTextFrom(error));
          this.statusKind.set('error');
          this.statusMessage.set('Customer Portal could not be opened.');
        },
      });
  }

  protected isCurrentPlan(plan: SubscriptionPlanResource): boolean {
    return plan.code === this.currentPlanCode();
  }

  protected isPlanActionDisabled(plan: SubscriptionPlanResource): boolean {
    return (
      this.loading() ||
      this.checkoutPlanCode() !== null ||
      this.isCurrentPlan(plan) ||
      plan.monthlyPriceCents === 0
    );
  }

  protected planActionLabel(plan: SubscriptionPlanResource): string {
    if (this.isCurrentPlan(plan)) {
      return 'Current plan';
    }

    if (plan.monthlyPriceCents === 0) {
      return 'Included';
    }

    if (this.checkoutPlanCode() === plan.code) {
      return 'Opening checkout';
    }

    return 'Upgrade';
  }

  protected formatPrice(plan: SubscriptionPlanResource): string {
    if (plan.monthlyPriceCents === 0) {
      return 'Free';
    }

    return `${new Intl.NumberFormat('en-US', {
      currency: plan.currency || 'USD',
      style: 'currency',
    }).format(plan.monthlyPriceCents / 100)} / month`;
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) {
      return 'Not scheduled';
    }

    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  protected usagePercent(item: UsageItem): number {
    if (!item.limit || item.limit <= 0) {
      return 0;
    }

    return Math.min(Math.round((item.used / item.limit) * 100), 100);
  }

  protected usageLabel(item: UsageItem): string {
    if (item.limit === null) {
      return `${item.used} ${item.unit} / unlimited`;
    }

    return `${item.used} / ${item.limit} ${item.unit}`;
  }

  protected planLimits(plan: SubscriptionPlanResource): PlanLimitItem[] {
    return [
      { label: 'Locations', value: this.limitLabel(plan.usageLimits.maxLocations, 'sites') },
      { label: 'Assets', value: this.limitLabel(plan.usageLimits.maxAssets, 'assets') },
      { label: 'IoT devices', value: this.limitLabel(plan.usageLimits.maxIotDevices, 'devices') },
      { label: 'Users', value: this.limitLabel(plan.usageLimits.maxUsers, 'users') },
      {
        label: 'History',
        value: this.limitLabel(plan.usageLimits.historyRetentionDays, 'days'),
      },
    ];
  }

  protected featureFlags(plan: SubscriptionPlanResource): FeatureFlagItem[] {
    return [
      { label: 'CSV exports', enabled: plan.featureFlags.allowsExports },
      { label: 'Maintenance scheduling', enabled: plan.featureFlags.allowsMaintenance },
      { label: 'AI incident guidance', enabled: plan.featureFlags.allowsAiGuidance },
      { label: 'AI report summaries', enabled: plan.featureFlags.allowsAiReportSummary },
    ];
  }

  protected entitlementLabel(entitlement: OrganizationEntitlementResource): string {
    return entitlement.key
      .replace(/^ENTITLEMENT_/i, '')
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected entitlementUsage(entitlement: OrganizationEntitlementResource): string {
    if (entitlement.limit === null || entitlement.used === null) {
      return entitlement.enabled ? 'Available' : 'Locked';
    }

    return `${entitlement.used} / ${entitlement.limit}`;
  }

  private prepareReturnMessage(): void {
    const checkoutStatus = this.route.snapshot.queryParamMap.get('checkout');

    if (checkoutStatus === 'success') {
      this.statusKind.set('success');
      this.statusMessage.set('Checkout completed. ColdTrace is refreshing the subscription state.');
      return;
    }

    if (checkoutStatus === 'cancel') {
      this.statusKind.set('warning');
      this.statusMessage.set('Checkout was cancelled before the subscription changed.');
    }
  }

  private limitLabel(limit: number | null, unit: string): string {
    return limit === null ? `Unlimited ${unit}` : `${limit} ${unit}`;
  }

  private errorTextFrom(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        return 'Your session expired. Sign in again to manage billing.';
      }

      if (error.status === 409) {
        return this.detailFrom(error) || 'The requested plan cannot be activated for this organization.';
      }

      if (error.status === 502 || error.status === 503) {
        return 'The billing provider is unavailable or not configured for this environment.';
      }

      return this.detailFrom(error) || `Billing request failed with status ${error.status}.`;
    }

    if (error instanceof Error && error.message === 'organization-scope-required') {
      return 'Select an organization before managing billing.';
    }

    return error instanceof Error ? error.message : 'Unexpected billing error.';
  }

  private detailFrom(error: HttpErrorResponse): string {
    if (typeof error.error === 'string') {
      return error.error;
    }

    const errorBody = error.error as { detail?: string; message?: string; title?: string } | null;

    return errorBody?.detail ?? errorBody?.message ?? errorBody?.title ?? '';
  }
}

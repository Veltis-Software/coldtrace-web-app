export interface SubscriptionPlanUsageLimitsResource {
  maxLocations: number | null;
  maxAssets: number | null;
  maxIotDevices: number | null;
  maxUsers: number | null;
  historyRetentionDays: number | null;
}

export interface SubscriptionPlanFeatureFlagsResource {
  allowsExports: boolean;
  allowsMaintenance: boolean;
  allowsAiGuidance: boolean;
  allowsAiReportSummary: boolean;
}

export interface SubscriptionPlanResource {
  id: number;
  code: string;
  displayName: string;
  description: string;
  monthlyPriceCents: number;
  currency: string;
  stripePriceId: string | null;
  recommended: boolean;
  recommendedLabel: string | null;
  visible: boolean;
  usageLimits: SubscriptionPlanUsageLimitsResource;
  featureFlags: SubscriptionPlanFeatureFlagsResource;
  includedFeatures: string[];
}

export interface OrganizationSubscriptionUsageResource {
  locations: number;
  assets: number;
  iotDevices: number;
  users: number;
}

export interface OrganizationEntitlementResource {
  key: string;
  category: string;
  enabled: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  lockedReason: string | null;
}

export interface OrganizationSubscriptionResource {
  id: number;
  organizationId: number;
  status: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  metadata: string | null;
  plan: SubscriptionPlanResource;
  usage: OrganizationSubscriptionUsageResource;
  entitlements: OrganizationEntitlementResource[];
}

export interface CreateBillingCheckoutSessionRequest {
  targetPlanCode: string;
}

export interface BillingCheckoutSessionResource {
  provider: string;
  sessionId: string;
  checkoutUrl: string;
  targetPlanCode: string;
}

export interface BillingPortalSessionResource {
  provider: string;
  sessionId: string;
  portalUrl: string;
  organizationId: number;
}

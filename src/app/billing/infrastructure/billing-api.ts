import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { BillingCheckoutSessionsApiEndpoint } from './billing-checkout-sessions-api-endpoint';
import { BillingPortalSessionsApiEndpoint } from './billing-portal-sessions-api-endpoint';
import {
  BillingCheckoutSessionResource,
  BillingPortalSessionResource,
  OrganizationSubscriptionResource,
  SubscriptionPlanResource,
} from './billing-response';
import { OrganizationSubscriptionsApiEndpoint } from './organization-subscriptions-api-endpoint';
import { SubscriptionPlansApiEndpoint } from './subscription-plans-api-endpoint';

/**
 * @summary Groups billing API operations used by subscription views.
 */
@Injectable({ providedIn: 'root' })
export class BillingApi extends BaseApi {
  private readonly checkoutSessionsEndpoint: BillingCheckoutSessionsApiEndpoint;
  private readonly portalSessionsEndpoint: BillingPortalSessionsApiEndpoint;
  private readonly subscriptionPlansEndpoint: SubscriptionPlansApiEndpoint;
  private readonly subscriptionsEndpoint: OrganizationSubscriptionsApiEndpoint;

  constructor(http: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.checkoutSessionsEndpoint = new BillingCheckoutSessionsApiEndpoint(http, organizationScope);
    this.portalSessionsEndpoint = new BillingPortalSessionsApiEndpoint(http, organizationScope);
    this.subscriptionPlansEndpoint = new SubscriptionPlansApiEndpoint(http);
    this.subscriptionsEndpoint = new OrganizationSubscriptionsApiEndpoint(http, organizationScope);
  }

  /**
   * @summary Reads public plan catalog.
   */
  getSubscriptionPlans(): Observable<SubscriptionPlanResource[]> {
    return this.subscriptionPlansEndpoint.getAll();
  }

  /**
   * @summary Reads current organization subscription.
   */
  getCurrentSubscription(): Observable<OrganizationSubscriptionResource> {
    return this.subscriptionsEndpoint.getCurrent();
  }

  /**
   * @summary Creates a provider-hosted Checkout session.
   */
  createCheckoutSession(targetPlanCode: string): Observable<BillingCheckoutSessionResource> {
    return this.checkoutSessionsEndpoint.create(targetPlanCode);
  }

  /**
   * @summary Creates a provider-hosted Customer Portal session.
   */
  createPortalSession(): Observable<BillingPortalSessionResource> {
    return this.portalSessionsEndpoint.create();
  }
}

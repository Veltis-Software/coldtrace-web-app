import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import {
  BillingCheckoutSessionResource,
  CreateBillingCheckoutSessionRequest,
} from './billing-response';

/**
 * @summary Calls organization-scoped billing checkout session endpoints.
 */
export class BillingCheckoutSessionsApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Creates a provider-hosted Checkout session for a paid plan.
   */
  create(targetPlanCode: string): Observable<BillingCheckoutSessionResource> {
    const endpointUrl = this.organizationScope.endpointUrlFor('billing/checkout-sessions');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    const request: CreateBillingCheckoutSessionRequest = { targetPlanCode };

    return this.http.post<BillingCheckoutSessionResource>(endpointUrl, request);
  }
}

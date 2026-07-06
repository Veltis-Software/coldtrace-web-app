import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { BillingPortalSessionResource } from './billing-response';

/**
 * @summary Calls organization-scoped billing customer portal endpoints.
 */
export class BillingPortalSessionsApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Creates a provider-hosted Customer Portal session.
   */
  create(): Observable<BillingPortalSessionResource> {
    const endpointUrl = this.organizationScope.endpointUrlFor('billing/portal-sessions');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<BillingPortalSessionResource>(endpointUrl, {});
  }
}

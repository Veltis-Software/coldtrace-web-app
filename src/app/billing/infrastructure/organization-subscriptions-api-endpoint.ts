import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { OrganizationSubscriptionResource } from './billing-response';

/**
 * @summary Calls organization-scoped subscription endpoints.
 */
export class OrganizationSubscriptionsApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Gets the active organization's subscription state and entitlements.
   */
  getCurrent(): Observable<OrganizationSubscriptionResource> {
    const endpointUrl = this.organizationScope.endpointUrlFor('subscription');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.get<OrganizationSubscriptionResource>(endpointUrl);
  }
}

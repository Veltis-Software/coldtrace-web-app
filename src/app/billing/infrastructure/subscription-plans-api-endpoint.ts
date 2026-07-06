import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubscriptionPlanResource } from './billing-response';

/**
 * @summary Calls the public backend subscription plan catalog.
 */
export class SubscriptionPlansApiEndpoint {
  private readonly endpointUrl = `${environment.platformProviderApiBaseUrl}/api/v1/subscription-plans`;

  constructor(private http: HttpClient) {}

  /**
   * @summary Reads active ColdTrace plans with pricing, limits, and feature flags.
   */
  getAll(): Observable<SubscriptionPlanResource[]> {
    return this.http.get<SubscriptionPlanResource[]>(this.endpointUrl);
  }
}

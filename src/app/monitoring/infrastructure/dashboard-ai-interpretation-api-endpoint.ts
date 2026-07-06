import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import {
  DashboardAiInterpretationRequest,
  DashboardAiInterpretationResource,
} from './dashboard-ai-interpretation-response';

/**
 * @summary Calls the backend endpoint that generates operational dashboard AI interpretations.
 */
export class DashboardAiInterpretationApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Generates an AI interpretation for the active organization's dashboard.
   */
  generate(
    request: DashboardAiInterpretationRequest,
  ): Observable<DashboardAiInterpretationResource> {
    const endpointUrl = this.organizationScope.endpointUrlFor('dashboard/ai-interpretation');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<DashboardAiInterpretationResource>(endpointUrl, request);
  }
}

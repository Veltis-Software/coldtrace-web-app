import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { ReportAiSummaryResource } from './report-ai-summary-resource';

/**
 * @summary Calls report-scoped AI summary endpoints.
 */
export class ReportAiSummaryApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Generates an advisory AI summary from a persisted report.
   */
  generate(reportId: number): Observable<ReportAiSummaryResource> {
    const endpointUrl = this.organizationScope.endpointUrlFor(`reports/${reportId}/ai-summary`);

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<ReportAiSummaryResource>(endpointUrl, {});
  }
}

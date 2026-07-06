import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import {
  AiResolutionPlanResource,
  ApproveAiResolutionPlanRequest,
  RejectAiResolutionPlanRequest,
} from './ai-resolution-plan-resource';

/**
 * @summary Calls organization-scoped AI resolution plan endpoints for incidents.
 */
export class AiResolutionPlansApiEndpoint {
  constructor(private http: HttpClient, private organizationScope: OrganizationScopeStore) {}

  /**
   * @summary Lists AI resolution plan audit records for one incident.
   */
  getAll(incidentId: number): Observable<AiResolutionPlanResource[]> {
    const endpointUrl = this.endpointUrlFor(incidentId);

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.get<AiResolutionPlanResource[]>(endpointUrl);
  }

  /**
   * @summary Generates a pending AI resolution plan for one incident.
   */
  generate(incidentId: number): Observable<AiResolutionPlanResource> {
    const endpointUrl = this.endpointUrlFor(incidentId);

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<AiResolutionPlanResource>(endpointUrl, {});
  }

  /**
   * @summary Approves a pending AI plan and lets the backend resolve the incident.
   */
  approve(
    incidentId: number,
    planId: number,
    request: ApproveAiResolutionPlanRequest,
  ): Observable<AiResolutionPlanResource> {
    const endpointUrl = this.planDecisionUrlFor(incidentId, planId, 'approvals');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<AiResolutionPlanResource>(endpointUrl, request);
  }

  /**
   * @summary Rejects a pending AI plan without changing the incident lifecycle state.
   */
  reject(
    incidentId: number,
    planId: number,
    request: RejectAiResolutionPlanRequest,
  ): Observable<AiResolutionPlanResource> {
    const endpointUrl = this.planDecisionUrlFor(incidentId, planId, 'rejections');

    if (!endpointUrl) {
      return throwError(() => new Error('organization-scope-required'));
    }

    return this.http.post<AiResolutionPlanResource>(endpointUrl, request);
  }

  private endpointUrlFor(incidentId: number): string {
    return this.organizationScope.endpointUrlFor(`incidents/${incidentId}/ai-resolution-plans`);
  }

  private planDecisionUrlFor(incidentId: number, planId: number, action: string): string {
    const endpointUrl = this.endpointUrlFor(incidentId);
    return endpointUrl ? `${endpointUrl}/${planId}/${action}` : '';
  }
}

import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { TechnicalServiceRequest } from '../domain/model/technical-service-request.entity';
import { TechnicalServiceRequestAssembler } from './technical-service-request-assembler';
import {
  CreateTechnicalServiceRequest,
  TechnicalServiceRequestResource,
  TechnicalServiceRequestsResponse,
  UpdateTechnicalServiceRequestStatus,
} from './technical-service-requests-response';

/**
 * @summary Connects technical service requests API endpoint resources to the generic API endpoint contract.
 */
export class TechnicalServiceRequestsApiEndpoint extends BaseApiEndpoint<
  TechnicalServiceRequest,
  TechnicalServiceRequestResource,
  TechnicalServiceRequestsResponse,
  TechnicalServiceRequestAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new TechnicalServiceRequestAssembler());
  }

  /**
   * @summary Fetches technical service requests for the active organization.
   */
  override getAll(): Observable<TechnicalServiceRequest[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  override create(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    const request: CreateTechnicalServiceRequest = {
      assetId: technicalServiceRequest.assetId,
      incidentId: technicalServiceRequest.incidentId,
      issueDescription: technicalServiceRequest.issueDescription,
      priority: technicalServiceRequest.priority,
      requestedBy: technicalServiceRequest.requestedBy,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<TechnicalServiceRequestResource>(this.endpointUrl, request).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
    );
  }

  updateStatus(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    const request: UpdateTechnicalServiceRequestStatus = {
      status: technicalServiceRequest.status,
      closureSummary: technicalServiceRequest.resultNotes,
      evidence: technicalServiceRequest.interventionNotes,
      closedBy: technicalServiceRequest.closedBy,
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .patch<TechnicalServiceRequestResource>(
        `${this.endpointUrl}/${technicalServiceRequest.id}`,
        request,
      )
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('technical-service-requests');
  }
}

import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { TechnicalServiceRequest } from '../domain/model/technical-service-request.entity';
import {
  TechnicalServiceRequestResource,
  TechnicalServiceRequestsResponse,
} from './technical-service-requests-response';

/**
 * @summary Maps technical service request data between domain entities and API resources.
 */
export class TechnicalServiceRequestAssembler implements BaseAssembler<
  TechnicalServiceRequest,
  TechnicalServiceRequestResource,
  TechnicalServiceRequestsResponse
> {
  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: TechnicalServiceRequestsResponse): TechnicalServiceRequest[] {
    return response.technicalServiceRequests.map((resource) => this.toEntityFromResource(resource));
  }

  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: TechnicalServiceRequestResource): TechnicalServiceRequest {
    return new TechnicalServiceRequest(
      Number(resource.id),
      resource.organizationId,
      resource.uuid,
      resource.assetId,
      resource.priority,
      resource.issueDescription,
      resource.requestedDate ?? resource.requestedAt ?? '',
      resource.status,
      resource.interventionNotes ?? resource.evidence ?? null,
      resource.resultNotes ?? resource.closureSummary ?? null,
      resource.functionalTestPassed ?? this.functionalTestStatusFrom(resource),
      resource.closedAt,
      resource.assetLocationId ?? null,
      resource.assetName ?? null,
      resource.incidentId ?? null,
      resource.requestedBy ?? null,
      resource.closedBy ?? null,
    );
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: TechnicalServiceRequest): TechnicalServiceRequestResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      uuid: entity.uuid,
      assetId: entity.assetId,
      assetLocationId: entity.assetLocationId,
      assetName: entity.assetName ?? undefined,
      incidentId: entity.incidentId,
      priority: entity.priority,
      issueDescription: entity.issueDescription,
      requestedDate: entity.requestedDate,
      requestedAt: entity.requestedDate,
      status: entity.status,
      requestedBy: entity.requestedBy,
      interventionNotes: entity.interventionNotes,
      resultNotes: entity.resultNotes,
      functionalTestPassed: entity.functionalTestPassed,
      closureSummary: entity.resultNotes,
      evidence: entity.interventionNotes,
      closedBy: entity.closedBy,
      closedAt: entity.closedAt,
    };
  }

  private functionalTestStatusFrom(
    resource: TechnicalServiceRequestResource,
  ): boolean | null {
    if (resource.status === 'closed') {
      return true;
    }

    if (resource.status === 'pending-review' && (resource.closureSummary || resource.evidence)) {
      return false;
    }

    return null;
  }
}

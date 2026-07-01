import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { Incident } from '../domain/model/incident.entity';
import { IncidentResource, IncidentsResponse } from './incident-resource';

/**
 * @summary Maps incident data between domain entities and API resources.
 */
export class IncidentAssembler implements BaseAssembler<Incident, IncidentResource, IncidentsResponse> {
  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: IncidentResource): Incident {
    return new Incident({
      id: Number(resource.id),
      organizationId: resource.organizationId,
      assetId: resource.assetId,
      assetName: resource.assetName,
      type: resource.type,
      severity: resource.severity,
      value: resource.value,
      detectedAt: resource.detectedAt,
      status: this.statusFrom(resource.status),
      recognizedBy: resource.recognizedBy ?? resource.acknowledgedBy ?? null,
      recognizedAt: resource.recognizedAt ?? resource.acknowledgedAt ?? null,
      conditionStable: resource.conditionStable ?? false,
      correctiveAction: resource.correctiveAction ?? resource.resolutionNotes ?? null,
      closureEvidence: resource.closureEvidence ?? null,
      closedBy: resource.closedBy ?? resource.resolvedBy ?? null,
      closedAt: resource.closedAt ?? resource.resolvedAt ?? null,
      conditionKey: resource.conditionKey ?? null,
      source: resource.source ?? 'initial-data',
      sourceReadingId: resource.sourceReadingId ?? resource.readingId ?? null,
      reviewStatus: resource.reviewStatus ?? 'complete',
      escalationStatus: resource.escalationStatus ?? (resource.escalatedAt ? 'escalated' : 'none'),
      escalationLevel: resource.escalationLevel ?? 0,
      escalationPolicyMinutes: resource.escalationPolicyMinutes ?? null,
      escalatedAt: resource.escalatedAt ?? null,
      escalatedTo: resource.escalatedTo ?? resource.escalatedBy ?? null,
      escalationReviewedBy: resource.escalationReviewedBy ?? null,
      escalationReviewedAt: resource.escalationReviewedAt ?? null,
    });
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: Incident): IncidentResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      assetId: entity.assetId,
      assetName: entity.assetName,
      type: entity.type,
      severity: entity.severity,
      value: entity.value,
      detectedAt: entity.detectedAt,
      status: entity.status,
      recognizedBy: entity.recognizedBy,
      recognizedAt: entity.recognizedAt,
      acknowledgedBy: entity.recognizedBy,
      acknowledgedAt: entity.recognizedAt,
      conditionStable: entity.conditionStable,
      correctiveAction: entity.correctiveAction,
      closureEvidence: entity.closureEvidence,
      closedBy: entity.closedBy,
      closedAt: entity.closedAt,
      resolvedBy: entity.closedBy,
      resolvedAt: entity.closedAt,
      resolutionNotes: entity.correctiveAction,
      conditionKey: entity.conditionKey,
      source: entity.source,
      sourceReadingId: entity.sourceReadingId,
      reviewStatus: entity.reviewStatus,
      escalationStatus: entity.escalationStatus,
      escalationLevel: entity.escalationLevel,
      escalationPolicyMinutes: entity.escalationPolicyMinutes,
      escalatedAt: entity.escalatedAt,
      escalatedTo: entity.escalatedTo,
      escalatedBy: entity.escalatedTo,
      escalationReason: entity.escalationStatus,
      escalationReviewedBy: entity.escalationReviewedBy,
      escalationReviewedAt: entity.escalationReviewedAt,
    };
  }

  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: IncidentsResponse): Incident[] {
    return response.incidents.map((resource) => this.toEntityFromResource(resource));
  }

  private statusFrom(status: string): 'open' | 'recognized' | 'closed' {
    if (status === 'acknowledged' || status === 'recognized') {
      return 'recognized';
    }

    if (status === 'resolved' || status === 'closed') {
      return 'closed';
    }

    return 'open';
  }
}

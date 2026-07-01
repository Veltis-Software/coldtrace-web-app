import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';
import {
  IncidentEscalationStatus,
  IncidentReviewStatus,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
} from '../domain/model/incident.entity';

/**
 * @summary Raw incident resource from the ColdTrace API.
 */
export interface IncidentResource extends BaseResource {
  organizationId: number;
  assetId: number;
  deviceId?: number | null;
  readingId?: number | null;
  assetName: string;
  deviceName?: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  value: string;
  detectedAt: string;
  status: IncidentStatus;
  recognizedBy?: string | null;
  recognizedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  conditionStable?: boolean;
  correctiveAction?: string | null;
  correctiveActionRegisteredAt?: string | null;
  correctiveActionRegisteredBy?: string | null;
  closureEvidence?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  conditionKey?: string | null;
  source?: IncidentSource;
  sourceReadingId?: number | null;
  reviewStatus?: IncidentReviewStatus;
  escalationStatus?: IncidentEscalationStatus;
  escalationLevel?: number;
  escalationPolicyMinutes?: number | null;
  escalatedAt?: string | null;
  escalatedTo?: string | null;
  escalatedBy?: string | null;
  escalationReason?: string | null;
  escalationReviewedBy?: string | null;
  escalationReviewedAt?: string | null;
  lastNotificationStatus?: string | null;
  lastNotificationAt?: string | null;
  notificationCount?: number;
}

/**
 * @summary Raw response from the ColdTrace API for incidents.
 */
export interface IncidentsResponse extends BaseResponse {
  incidents: IncidentResource[];
}

/**
 * @summary Request payload for creating an incident through the backend.
 */
export interface CreateIncidentRequest {
  assetId: number | null;
  deviceId: number | null;
  readingId: number | null;
  assetName: string | null;
  deviceName: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  value: string | null;
}

/**
 * @summary Request payload for acknowledging an incident.
 */
export interface AcknowledgeIncidentRequest {
  acknowledgedBy: string;
}

/**
 * @summary Request payload for escalating an incident.
 */
export interface EscalateIncidentRequest {
  escalatedBy: string;
  escalationReason: string;
}

/**
 * @summary Request payload for registering corrective action on an incident.
 */
export interface RegisterCorrectiveActionRequest {
  correctiveAction: string;
  registeredBy: string;
}

/**
 * @summary Request payload for resolving an incident.
 */
export interface ResolveIncidentRequest {
  resolvedBy: string;
  resolutionNotes: string;
}

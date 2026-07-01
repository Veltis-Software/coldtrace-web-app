import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';
import { TechnicalServiceStatus } from '../domain/model/technical-service-status.enum';

/**
 * @summary Raw technical service request resource from the ColdTrace API.
 */
export interface TechnicalServiceRequestResource extends BaseResource {
  organizationId: number;
  uuid: string;
  assetId: number;
  assetLocationId?: number | null;
  assetName?: string;
  incidentId?: number | null;
  priority: string;
  issueDescription: string;
  requestedDate?: string;
  requestedAt?: string;
  status: TechnicalServiceStatus;
  requestedBy?: string | null;
  interventionNotes?: string | null;
  resultNotes?: string | null;
  functionalTestPassed?: boolean | null;
  closureSummary?: string | null;
  evidence?: string | null;
  closedBy?: string | null;
  closedAt: string | null;
}

/**
 * @summary Raw response from the ColdTrace API for technical service requests.
 */
export interface TechnicalServiceRequestsResponse extends BaseResponse {
  technicalServiceRequests: TechnicalServiceRequestResource[];
}

/**
 * @summary Request payload for opening a corrective technical service request.
 */
export interface CreateTechnicalServiceRequest {
  assetId: number;
  incidentId?: number | null;
  issueDescription: string;
  priority: string;
  requestedBy?: string | null;
}

/**
 * @summary Request payload for changing technical service request lifecycle status.
 */
export interface UpdateTechnicalServiceRequestStatus {
  status: TechnicalServiceStatus;
  closureSummary?: string | null;
  evidence?: string | null;
  closedBy?: string | null;
}

import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';

/**
 * @summary Raw organization resource from the ColdTrace API.
 */
export interface OrganizationResource extends BaseResource {
  legalName: string;
  commercialName: string;
  taxId: string;
  contactEmail: string;
}

/**
 * @summary Raw response from the ColdTrace API for organizations.
 */
export interface OrganizationsResponse extends BaseResponse {
  organizations: OrganizationResource[];
}

/**
 * @summary Request payload for creating an organization through the backend.
 */
export interface CreateOrganizationRequest {
  legalName: string;
  commercialName: string;
  taxId: string;
  contactEmail: string;
}

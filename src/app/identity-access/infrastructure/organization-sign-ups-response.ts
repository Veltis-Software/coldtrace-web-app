import { Organization } from '../domain/model/organization.entity';
import { User } from '../domain/model/user.entity';
import { OrganizationResource } from './organizations-response';
import { UserResource } from './users-response';

/**
 * @summary Request payload for the backend organization sign-up endpoint.
 */
export interface CreateOrganizationSignUpRequest {
  legalName: string;
  commercialName: string;
  taxId?: string;
  contactEmail: string;
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
}

/**
 * @summary Raw response from the ColdTrace API for organization sign-up.
 */
export interface OrganizationSignUpResource {
  organization: OrganizationResource;
  user: UserResource;
}

/**
 * @summary Domain response returned after creating an organization and creator user.
 */
export interface OrganizationSignUp {
  organization: Organization;
  user: User;
}

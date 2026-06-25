import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';

/**
 * @summary Raw user resource from the ColdTrace API.
 */
export interface UserResource extends BaseResource {
  uuid?: string;
  organizationUserId?: number;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: number;
  roleId: number;
}

/**
 * @summary Raw response from the ColdTrace API for users.
 */
export interface UsersResponse extends BaseResponse {
  users: UserResource[];
}

/**
 * @summary Request payload for creating a user inside an organization.
 */
export interface CreateUserRequest {
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
  roleId: number;
}

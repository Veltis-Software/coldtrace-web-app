import { User } from '../domain/model/user.entity';
import { UserResource } from './users-response';

/**
 * @summary Request payload for email/password authentication.
 */
export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * @summary Request payload for social provider authentication.
 */
export interface SocialTokenExchangeRequest {
  idToken?: string;
  authorizationCode?: string;
  redirectUri?: string;
  nonce?: string;
}

/**
 * Validated social provider profile used to prefill organization sign-up.
 */
export interface SocialIdentityProfile {
  idToken: string;
  email: string;
  fullName: string;
}

/**
 * @summary Request payload for social provider organization sign-up.
 */
export interface SocialOrganizationSignUpRequest extends SocialTokenExchangeRequest {
  organizationName: string;
  fullName: string;
}

/**
 * @summary Raw authentication response from the ColdTrace API.
 */
export interface AuthenticatedUserResource extends UserResource {
  token: string;
}

/**
 * @summary Domain authentication result used by the frontend session.
 */
export interface AuthenticatedUser {
  user: User;
  token: string;
}

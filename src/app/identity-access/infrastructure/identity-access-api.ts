import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Organization } from '../domain/model/organization.entity';
import { Role } from '../domain/model/role.entity';
import { User } from '../domain/model/user.entity';
import { OrganizationSignUpsApiEndpoint } from './organization-sign-ups-api-endpoint';
import {
  CreateOrganizationSignUpRequest,
  OrganizationSignUp,
} from './organization-sign-ups-response';
import {
  AuthenticatedUser,
  SignInRequest,
  SocialIdentityProfile,
  SocialOrganizationSignUpRequest,
  SocialTokenExchangeRequest,
} from './authentication-response';
import { AuthenticationApiEndpoint } from './authentication-api-endpoint';
import { OrganizationsApiEndpoint } from './organizations-api-endpoint';
import { RolesApiEndpoint } from './roles-api-endpoint';
import { UsersApiEndpoint } from './users-api-endpoint';

/**
 * @summary Groups identity access API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class IdentityAccessApi extends BaseApi {
  private readonly authenticationEndpoint: AuthenticationApiEndpoint;
  private readonly organizationSignUpsEndpoint: OrganizationSignUpsApiEndpoint;
  private readonly usersEndpoint: UsersApiEndpoint;
  private readonly organizationsEndpoint: OrganizationsApiEndpoint;
  private readonly rolesEndpoint: RolesApiEndpoint;
  private readonly organizationScope: OrganizationScopeStore;

  constructor(httpClient: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.organizationScope = organizationScope;
    this.authenticationEndpoint = new AuthenticationApiEndpoint(httpClient);
    this.organizationSignUpsEndpoint = new OrganizationSignUpsApiEndpoint(httpClient);
    this.usersEndpoint = new UsersApiEndpoint(httpClient, organizationScope);
    this.organizationsEndpoint = new OrganizationsApiEndpoint(httpClient);
    this.rolesEndpoint = new RolesApiEndpoint(httpClient);
  }

  /**
   * @summary Authenticates a user with email and password.
   */
  signIn(request: SignInRequest): Observable<AuthenticatedUser> {
    return this.authenticationEndpoint.signIn(request);
  }

  /**
   * @summary Authenticates a user with a Google authorization response.
   */
  signInWithGoogle(request: SocialTokenExchangeRequest): Observable<AuthenticatedUser> {
    return this.authenticationEndpoint.signInWithProvider('google', request);
  }

  /**
   * @summary Authenticates a user with a Sign in with Apple authorization response.
   */
  signInWithApple(request: SocialTokenExchangeRequest): Observable<AuthenticatedUser> {
    return this.authenticationEndpoint.signInWithProvider('apple', request);
  }

  /**
   * @summary Validates a social provider response and returns profile data for onboarding.
   */
  getSocialIdentityProfile(
    provider: 'google' | 'apple',
    request: SocialTokenExchangeRequest,
  ): Observable<SocialIdentityProfile> {
    return this.authenticationEndpoint.getSocialIdentityProfile(provider, request);
  }

  /**
   * @summary Creates an organization and authenticates the first user with a social provider.
   */
  createSocialOrganizationSignUp(
    provider: 'google' | 'apple',
    request: SocialOrganizationSignUpRequest,
  ): Observable<AuthenticatedUser> {
    return this.authenticationEndpoint.createSocialOrganizationSignUp(provider, request);
  }

  /**
   * @summary Creates an organization and its first user through the backend sign-up endpoint.
   */
  createOrganizationSignUp(
    request: CreateOrganizationSignUpRequest,
  ): Observable<OrganizationSignUp> {
    return this.organizationSignUpsEndpoint.create(request);
  }

  /**
   * @summary Fetches users from the API endpoint.
   */
  getUsers(): Observable<User[]> {
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      return of([]);
    }

    return this.usersEndpoint.getAll();
  }

  /**
   * @summary Fetches users for an explicit organization.
   */
  getUsersForOrganization(organizationId: number): Observable<User[]> {
    return this.usersEndpoint.getAllForOrganization(organizationId);
  }

  /**
   * @summary Persists a user through the API endpoint.
   */
  createUser(user: User, password: string): Observable<User> {
    return this.usersEndpoint.create(user, password);
  }

  /**
   * @summary Updates a user through the API endpoint.
   */
  updateUser(user: User): Observable<User> {
    return this.usersEndpoint.assignRole(user.id, user.roleId);
  }

  /**
   * @summary Fetches organizations from the API endpoint.
   */
  getOrganizations(): Observable<Organization[]> {
    return this.organizationsEndpoint.getAll();
  }

  /**
   * @summary Persists an organization through the API endpoint.
   */
  createOrganization(organization: Organization): Observable<Organization> {
    return this.organizationsEndpoint.create(organization);
  }

  /**
   * @summary Fetches roles from the API endpoint.
   */
  getRoles(): Observable<Role[]> {
    return this.rolesEndpoint.getAll();
  }
}

import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { User } from '../domain/model/user.entity';
import { UserAssembler } from './user-assembler';
import { CreateUserRequest, UserResource, UsersResponse } from './users-response';

/**
 * @summary Connects users API endpoint resources to the generic API endpoint contract.
 */
export class UsersApiEndpoint extends BaseApiEndpoint<
  User,
  UserResource,
  UsersResponse,
  UserAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new UserAssembler());
  }

  /**
   * @summary Fetches users for the active organization.
   */
  override getAll(): Observable<User[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Fetches users for an explicit organization without changing the active session.
   */
  getAllForOrganization(organizationId: number): Observable<User[]> {
    this.endpointUrl = this.organizationScope.endpointUrlForOrganization(organizationId, 'users');
    return super.getAll();
  }

  override create(user: User, password = ''): Observable<User> {
    const request: CreateUserRequest = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password,
      roleId: user.roleId,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<UserResource>(this.endpointUrl, request)
      .pipe(map((resource) => this.assembler.toEntityFromResource(resource)));
  }

  /**
   * @summary Assigns a role to a user through the backend role assignment endpoint.
   */
  assignRole(userId: number, roleId: number): Observable<User> {
    this.useActiveOrganizationEndpoint();

    return this.http.patch<UserResource>(`${this.endpointUrl}/${userId}/role`, { roleId })
      .pipe(map((resource) => this.assembler.toEntityFromResource(resource)));
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('users');
  }
}

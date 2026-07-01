import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OrganizationAssembler } from './organization-assembler';
import {
  CreateOrganizationSignUpRequest,
  OrganizationSignUp,
  OrganizationSignUpResource,
} from './organization-sign-ups-response';
import { UserAssembler } from './user-assembler';

/**
 * @summary Connects the organization sign-up API endpoint to identity access.
 */
export class OrganizationSignUpsApiEndpoint {
  private readonly endpointUrl = `${environment.platformProviderApiBaseUrl}${environment.platformProviderSignUpEndpointPath}`;
  private readonly organizationAssembler = new OrganizationAssembler();
  private readonly userAssembler = new UserAssembler();

  constructor(private http: HttpClient) {}

  /**
   * @summary Creates one organization and its first user in one backend transaction.
   */
  create(request: CreateOrganizationSignUpRequest): Observable<OrganizationSignUp> {
    return this.http.post<OrganizationSignUpResource>(this.endpointUrl, request).pipe(
      map((resource) => ({
        organization: this.organizationAssembler.toEntityFromResource(resource.organization),
        user: this.userAssembler.toEntityFromResource(resource.user),
      })),
    );
  }
}

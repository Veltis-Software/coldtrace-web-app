import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { Organization } from '../domain/model/organization.entity';
import { OrganizationAssembler } from './organization-assembler';
import {
  CreateOrganizationRequest,
  OrganizationResource,
  OrganizationsResponse,
} from './organizations-response';

/**
 * @summary Connects organizations API endpoint resources to the generic API endpoint contract.
 */
export class OrganizationsApiEndpoint extends BaseApiEndpoint<
  Organization,
  OrganizationResource,
  OrganizationsResponse,
  OrganizationAssembler
> {
  constructor(http: HttpClient) {
    super(
      http,
      `${environment.platformProviderApiBaseUrl}${environment.platformProviderOrganizationsEndpointPath}`,
      new OrganizationAssembler()
    );
  }

  /**
   * @summary Creates an organization using the backend request contract.
   */
  override create(organization: Organization): Observable<Organization> {
    const request: CreateOrganizationRequest = {
      legalName: organization.legalName,
      commercialName: organization.commercialName,
      taxId: organization.taxId,
      contactEmail: organization.contactEmail,
    };

    return this.http.post<OrganizationResource>(this.endpointUrl, request).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create organization')),
    );
  }
}

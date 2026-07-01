import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Location } from '../domain/model/location.entity';
import { LocationAssembler } from './location-assembler';
import {
  CreateLocationRequest,
  LocationResource,
  LocationsResponse,
  UpdateLocationRequest,
} from './locations-response';

/**
 * @summary Connects locations API endpoint resources to the generic API endpoint contract.
 */
export class LocationsApiEndpoint extends BaseApiEndpoint<
  Location,
  LocationResource,
  LocationsResponse,
  LocationAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new LocationAssembler());
  }

  /**
   * @summary Fetches locations for the active organization.
   */
  override getAll(): Observable<Location[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Creates a location using the backend request contract.
   */
  override create(location: Location): Observable<Location> {
    this.useActiveOrganizationEndpoint();

    return this.http.post<LocationResource>(this.endpointUrl, this.toRequest(location)).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create location')),
    );
  }

  /**
   * @summary Updates a location using the backend request contract.
   */
  override update(location: Location, id: number): Observable<Location> {
    this.useActiveOrganizationEndpoint();

    return this.http.put<LocationResource>(`${this.endpointUrl}/${id}`, this.toRequest(location)).pipe(
      map((updated) => this.assembler.toEntityFromResource(updated)),
      catchError(this.handleError('Failed to update location')),
    );
  }

  private toRequest(location: Location): CreateLocationRequest | UpdateLocationRequest {
    return {
      name: location.name,
      type: location.type,
      address: location.address,
      description: location.description,
      status: location.status,
    };
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('locations');
  }
}

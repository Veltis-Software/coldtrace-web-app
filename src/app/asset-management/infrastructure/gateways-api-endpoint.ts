import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Gateway } from '../domain/model/gateway.entity';
import { GatewayAssembler } from './gateway-assembler';
import {
  CreateGatewayRequest,
  GatewayResource,
  GatewaysResponse,
  UpdateGatewayRequest,
} from './gateways-response';

/**
 * @summary Connects gateways API endpoint resources to the generic API endpoint contract.
 */
export class GatewaysApiEndpoint extends BaseApiEndpoint<
  Gateway,
  GatewayResource,
  GatewaysResponse,
  GatewayAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new GatewayAssembler());
  }

  /**
   * @summary Fetches gateways for the active organization.
   */
  override getAll(): Observable<Gateway[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Creates a gateway using the backend request contract.
   */
  override create(gateway: Gateway): Observable<Gateway> {
    this.useActiveOrganizationEndpoint();

    return this.http.post<GatewayResource>(this.endpointUrl, this.toRequest(gateway)).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create gateway')),
    );
  }

  /**
   * @summary Updates a gateway using the backend request contract.
   */
  override update(gateway: Gateway, id: number): Observable<Gateway> {
    this.useActiveOrganizationEndpoint();

    return this.http.put<GatewayResource>(`${this.endpointUrl}/${id}`, this.toRequest(gateway)).pipe(
      map((updated) => this.assembler.toEntityFromResource(updated)),
      catchError(this.handleError('Failed to update gateway')),
    );
  }

  private toRequest(gateway: Gateway): CreateGatewayRequest | UpdateGatewayRequest {
    return {
      locationId: gateway.locationId,
      uuid: gateway.uuid,
      name: gateway.name,
      network: gateway.network,
      status: gateway.status,
    };
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('gateways');
  }
}

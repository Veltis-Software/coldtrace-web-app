import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { Gateway } from '../domain/model/gateway.entity';
import { GatewayResource, GatewaysResponse } from './gateways-response';

/**
 * @summary Maps gateway data between domain entities and API resources.
 */
export class GatewayAssembler implements BaseAssembler<Gateway, GatewayResource, GatewaysResponse> {
  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: GatewaysResponse): Gateway[] {
    return response.gateways.map((resource) => this.toEntityFromResource(resource));
  }

  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: GatewayResource): Gateway {
    return new Gateway(
      Number(resource.id),
      resource.organizationId,
      resource.locationId,
      resource.uuid,
      resource.name,
      resource.network,
      resource.status,
    );
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: Gateway): GatewayResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      locationId: entity.locationId,
      uuid: entity.uuid,
      name: entity.name,
      network: entity.network,
      status: entity.status,
    };
  }
}

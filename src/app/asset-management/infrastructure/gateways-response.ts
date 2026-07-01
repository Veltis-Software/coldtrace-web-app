import { GatewayStatus } from '../domain/model/gateway-status.enum';
import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';

/**
 * @summary Raw gateway resource from the ColdTrace API.
 */
export interface GatewayResource extends BaseResource {
  organizationId: number;
  locationId: number;
  uuid: string;
  name: string;
  network: string;
  status: GatewayStatus;
}

/**
 * @summary Raw response from the ColdTrace API for gateways.
 */
export interface GatewaysResponse extends BaseResponse {
  gateways: GatewayResource[];
}

/**
 * @summary Request payload for creating a gateway through the backend.
 */
export interface CreateGatewayRequest {
  locationId: number;
  uuid: string;
  name: string;
  network: string;
  status: GatewayStatus;
}

/**
 * @summary Request payload for updating a gateway through the backend.
 */
export interface UpdateGatewayRequest extends CreateGatewayRequest {}

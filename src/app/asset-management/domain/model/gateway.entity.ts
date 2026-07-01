import { BaseEntity } from '../../../shared/domain/model/base-entity';
import { GatewayStatus } from './gateway-status.enum';

/**
 * @summary Represents a gateway in the asset management bounded context.
 */
export class Gateway implements BaseEntity {
  constructor(
    private readonly _id: number,
    private readonly _organizationId: number,
    private readonly _locationId: number,
    private readonly _uuid: string,
    private readonly _name: string,
    private readonly _network: string,
    private readonly _status: GatewayStatus,
  ) {}

  get id(): number {
    return this._id;
  }

  get organizationId(): number {
    return this._organizationId;
  }

  get locationId(): number {
    return this._locationId;
  }

  get uuid(): string {
    return this._uuid;
  }

  get name(): string {
    return this._name;
  }

  get network(): string {
    return this._network;
  }

  get status(): GatewayStatus {
    return this._status;
  }
}

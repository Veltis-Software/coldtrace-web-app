import { BaseEntity } from '../../../shared/domain/model/base-entity';
import { AssetStatus } from './asset-status.enum';
import { AssetType } from './asset-type.enum';
import { ConnectivityStatus } from './connectivity-status.enum';

/**
 * @summary Represents an asset in the asset management bounded context.
 */
export class Asset implements BaseEntity {
  constructor(
    private _id: number,
    private _organizationId: number,
    private _uuid: string,
    private _type: AssetType,
    private _locationId: number,
    private _name: string,
    private _capacity: number,
    private _description: string,
    private _status: AssetStatus,
    private _lastIncident: string,
    private _currentTemperature: string,
    private _entryDate: string,
    private _connectivity: ConnectivityStatus,
  ) {}

  get id(): number {
    return this._id;
  }

  set id(value: number) {
    this._id = value;
  }

  get organizationId(): number {
    return this._organizationId;
  }

  get uuid(): string {
    return this._uuid;
  }

  get type(): AssetType {
    return this._type;
  }

  get name(): string {
    return this._name;
  }

  get locationId(): number {
    return this._locationId;
  }

  get capacity(): number {
    return this._capacity;
  }

  get description(): string {
    return this._description;
  }

  get status(): AssetStatus {
    return this._status;
  }

  get lastIncident(): string {
    return this._lastIncident;
  }

  get currentTemperature(): string {
    return this._currentTemperature;
  }

  get entryDate(): string {
    return this._entryDate;
  }

  get connectivity(): ConnectivityStatus {
    return this._connectivity;
  }
}

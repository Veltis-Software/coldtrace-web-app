import { BaseEntity } from '../../../shared/domain/model/base-entity';

/**
 * @summary Represents one thermal state distribution item in the monitoring bounded context.
 */
export class StorageDistributionItem implements BaseEntity {
  private _id: number;
  private _label: string;
  private _assetCount: number;
  private _percentage: number;
  private _color: string;

  constructor(item: { id: number; label: string; assetCount: number; percentage: number; color: string }) {
    this._id = item.id;
    this._label = item.label;
    this._assetCount = item.assetCount;
    this._percentage = item.percentage;
    this._color = item.color;
  }

  get id(): number { return this._id; }
  get label(): string { return this._label; }
  get assetCount(): number { return this._assetCount; }
  get percentage(): number { return this._percentage; }
  get color(): string { return this._color; }
}

import { BaseEntity } from '../../../shared/domain/model/base-entity';
import { MaintenanceScheduleStatus } from './maintenance-schedule-status.enum';

/**
 * @summary Represents a maintenance schedule in the maintenance management bounded context.
 */
export class MaintenanceSchedule implements BaseEntity {
  constructor(
    private readonly _id: number,
    private readonly _organizationId: number,
    private readonly _uuid: string,
    private readonly _assetId: number,
    private readonly _iotDeviceId: number | null,
    private readonly _scheduledDate: string,
    private readonly _period: string,
    private readonly _observations: string,
    private readonly _status: MaintenanceScheduleStatus,
    private readonly _createdAt: string,
    private readonly _frequencyDays: number | null = null,
    private readonly _responsibleUserId: number | null = null,
  ) {}

  get id(): number {
    return this._id;
  }

  get organizationId(): number {
    return this._organizationId;
  }

  get uuid(): string {
    return this._uuid;
  }

  get assetId(): number {
    return this._assetId;
  }

  get iotDeviceId(): number | null {
    return this._iotDeviceId;
  }

  get scheduledDate(): string {
    return this._scheduledDate;
  }

  get period(): string {
    return this._period;
  }

  get observations(): string {
    return this._observations;
  }

  get status(): MaintenanceScheduleStatus {
    return this._status;
  }

  get createdAt(): string {
    return this._createdAt;
  }

  get frequencyDays(): number | null {
    return this._frequencyDays;
  }

  get responsibleUserId(): number | null {
    return this._responsibleUserId;
  }
}

import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';
import { MaintenanceScheduleStatus } from '../domain/model/maintenance-schedule-status.enum';

/**
 * @summary Raw maintenance schedule resource from the ColdTrace API.
 */
export interface MaintenanceScheduleResource extends BaseResource {
  organizationId: number;
  uuid: string;
  assetId: number;
  iotDeviceId?: number | null;
  scheduledDate: string;
  period?: string;
  frequencyDays?: number | null;
  responsibleUserId?: number | null;
  observations: string;
  status: MaintenanceScheduleStatus;
  createdAt: string;
}

/**
 * @summary Raw response from the ColdTrace API for maintenance schedules.
 */
export interface MaintenanceSchedulesResponse extends BaseResponse {
  maintenanceSchedules: MaintenanceScheduleResource[];
}

/**
 * @summary Request payload for scheduling preventive maintenance in the ColdTrace API.
 */
export interface CreateMaintenanceScheduleRequest {
  assetId: number;
  scheduledDate: string;
  frequencyDays?: number | null;
  responsibleUserId?: number | null;
  observations?: string;
  status: MaintenanceScheduleStatus;
}

/**
 * @summary Request payload for changing maintenance schedule lifecycle status.
 */
export interface UpdateMaintenanceScheduleStatusRequest {
  status: MaintenanceScheduleStatus;
}

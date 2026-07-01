import { CalibrationStatus } from '../domain/model/calibration-status.enum';
import { IoTDeviceStatus } from '../domain/model/iot-device-status.enum';
import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';

/**
 * @summary Raw IoT device resource from the ColdTrace API.
 */
export interface IoTDeviceResource extends BaseResource {
  organizationId: number;
  gatewayId: number;
  uuid: string;
  deviceType: string;
  model: string;
  measurementType: string;
  measurementParameters?: string[];
  readingFrequencySeconds?: number;
  assetId: number | null;
  status: IoTDeviceStatus;
  calibrationStatus: CalibrationStatus;
  lastCalibrationDate: string;
  nextCalibrationDate: string;
}

/**
 * @summary Raw response from the ColdTrace API for IoT devices.
 */
export interface IoTDevicesResponse extends BaseResponse {
  iotDevices: IoTDeviceResource[];
}

/**
 * @summary Request payload for creating an IoT device through the backend.
 */
export interface CreateIoTDeviceRequest {
  gatewayId: number;
  uuid: string;
  deviceType: string;
  model: string;
  measurementType: string;
  measurementParameters?: string[];
  readingFrequencySeconds?: number;
  assetId: number | null;
  status: IoTDeviceStatus;
  calibrationStatus: CalibrationStatus;
  lastCalibrationDate: string;
  nextCalibrationDate: string;
}

/**
 * @summary Request payload for updating an IoT device through the backend.
 */
export interface UpdateIoTDeviceRequest extends CreateIoTDeviceRequest {}

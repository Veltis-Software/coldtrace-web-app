import { BaseResource, BaseResponse } from '../../shared/infrastructure/base-response';

/**
 * @summary Raw sensor reading resource from the ColdTrace API.
 */
export interface SensorReadingResource extends BaseResource {
  organizationId?: number;
  assetId: number;
  iotDeviceId: number;
  gatewayId?: number | null;
  locationId?: number | null;
  temperature: number | null;
  humidity: number | null;
  outOfRange?: boolean;
  isOutOfRange: boolean;
  recordedAt: string;
  motionDetected?: boolean | null;
  imageCaptured?: boolean | null;
  batteryLevel?: number | null;
  signalStrength?: number | null;
}

/**
 * @summary Raw response from the ColdTrace API for sensor readings.
 */
export interface SensorReadingsResponse extends BaseResponse {
  sensorReadings: SensorReadingResource[];
}

/**
 * @summary Request payload for recording one backend-owned sensor reading.
 */
export interface CreateSensorReadingRequest {
  assetId: number;
  iotDeviceId: number;
  temperature: number | null;
  humidity: number | null;
  recordedAt: string;
  motionDetected?: boolean | null;
  imageCaptured?: boolean | null;
  batteryLevel?: number | null;
  signalStrength?: number | null;
}

/**
 * @summary Request payload for backend-owned demo telemetry generation.
 */
export interface GenerateDemoSensorReadingsRequest {
  assetId?: number;
  count?: number;
}

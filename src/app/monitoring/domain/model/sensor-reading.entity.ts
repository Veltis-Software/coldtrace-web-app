/**
 * @summary Represents a sensor reading in the monitoring bounded context.
 */
export class SensorReading {
  constructor(
    public id: number,
    public assetId: number,
    public iotDeviceId: number,
    public temperature: number | null,
    public humidity: number | null,
    public isOutOfRange: boolean,
    public recordedAt: string,
    public motionDetected: boolean | null = null,
    public imageCaptured: boolean | null = null,
    public batteryLevel: number | null = null,
    public signalStrength: number | null = null,
    public organizationId: number | null = null,
    public gatewayId: number | null = null,
    public locationId: number | null = null,
  ) {}
}

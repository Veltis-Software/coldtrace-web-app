import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { IoTDevice } from '../domain/model/iot-device.entity';
import { IoTDeviceAssembler } from './iot-device-assembler';
import {
  CreateIoTDeviceRequest,
  IoTDeviceResource,
  IoTDevicesResponse,
  UpdateIoTDeviceRequest,
} from './iot-devices-response';

/**
 * @summary Connects IoT devices API endpoint resources to the generic API endpoint contract.
 */
export class IoTDevicesApiEndpoint extends BaseApiEndpoint<
  IoTDevice,
  IoTDeviceResource,
  IoTDevicesResponse,
  IoTDeviceAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new IoTDeviceAssembler());
  }

  /**
   * @summary Fetches IoT devices for the active organization.
   */
  override getAll(): Observable<IoTDevice[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Creates an IoT device using the backend request contract.
   */
  override create(iotDevice: IoTDevice): Observable<IoTDevice> {
    this.useActiveOrganizationEndpoint();

    return this.http.post<IoTDeviceResource>(this.endpointUrl, this.toRequest(iotDevice)).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create IoT device')),
    );
  }

  /**
   * @summary Updates an IoT device using the backend request contract.
   */
  override update(iotDevice: IoTDevice, id: number): Observable<IoTDevice> {
    this.useActiveOrganizationEndpoint();

    return this.http
      .put<IoTDeviceResource>(`${this.endpointUrl}/${id}`, this.toRequest(iotDevice))
      .pipe(
        map((updated) => this.assembler.toEntityFromResource(updated)),
        catchError(this.handleError('Failed to update IoT device')),
      );
  }

  private toRequest(iotDevice: IoTDevice): CreateIoTDeviceRequest | UpdateIoTDeviceRequest {
    return {
      gatewayId: iotDevice.gatewayId,
      uuid: iotDevice.uuid,
      deviceType: iotDevice.deviceType,
      model: iotDevice.model,
      measurementType: iotDevice.measurementType,
      measurementParameters: iotDevice.measurementParameters,
      readingFrequencySeconds: iotDevice.readingFrequencySeconds,
      assetId: iotDevice.assetId,
      status: iotDevice.status,
      calibrationStatus: iotDevice.calibrationStatus,
      lastCalibrationDate: iotDevice.lastCalibrationDate,
      nextCalibrationDate: iotDevice.nextCalibrationDate,
    };
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('iot-devices');
  }
}

import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { SensorReading } from '../domain/model/sensor-reading.entity';
import { SensorReadingAssembler } from './sensor-reading-assembler';
import {
  CreateSensorReadingRequest,
  GenerateDemoSensorReadingsRequest,
  SensorReadingResource,
  SensorReadingsResponse,
} from './sensor-readings-response';

/**
 * @summary Connects sensor readings API endpoint resources to the generic API endpoint contract.
 */
export class SensorReadingsApiEndpoint extends BaseApiEndpoint<SensorReading, SensorReadingResource, SensorReadingsResponse, SensorReadingAssembler> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new SensorReadingAssembler());
  }

  /**
   * @summary Fetches sensor readings for the active organization.
   */
  override getAll(): Observable<SensorReading[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Creates readings without a client-side id so the backend owns the persisted identifier.
   */
  override create(entity: SensorReading): Observable<SensorReading> {
    const request: CreateSensorReadingRequest = {
      assetId: entity.assetId,
      iotDeviceId: entity.iotDeviceId,
      temperature: entity.temperature,
      humidity: entity.humidity,
      recordedAt: entity.recordedAt,
      motionDetected: entity.motionDetected,
      imageCaptured: entity.imageCaptured,
      batteryLevel: entity.batteryLevel,
      signalStrength: entity.signalStrength,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<SensorReadingResource>(this.endpointUrl, request).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create entity')),
    );
  }

  /**
   * @summary Requests backend-owned realistic demo readings.
   */
  generateDemoReadings(request: GenerateDemoSensorReadingsRequest): Observable<SensorReading[]> {
    this.useActiveOrganizationEndpoint();

    return this.http
      .post<SensorReadingResource[]>(`${this.endpointUrl}/demo-generations`, request)
      .pipe(
        map((resources) =>
          resources.map((resource) => this.assembler.toEntityFromResource(resource)),
        ),
        catchError(this.handleError('Failed to generate demo readings')),
      );
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('sensor-readings');
  }
}

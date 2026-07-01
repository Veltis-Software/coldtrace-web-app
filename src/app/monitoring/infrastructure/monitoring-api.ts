import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { SensorReading } from '../domain/model/sensor-reading.entity';
import { GenerateDemoSensorReadingsRequest } from './sensor-readings-response';
import { SensorReadingsApiEndpoint } from './sensor-readings-api-endpoint';

/**
 * @summary Groups monitoring API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class MonitoringApi extends BaseApi {
  private readonly sensorReadingsEndpoint: SensorReadingsApiEndpoint;

  constructor(http: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.sensorReadingsEndpoint = new SensorReadingsApiEndpoint(http, organizationScope);
  }

  /**
   * @summary Fetches sensor readings from the API endpoint.
   */
  getSensorReadings(): Observable<SensorReading[]> {
    return this.sensorReadingsEndpoint.getAll();
  }

  /**
   * @summary Persists a sensor reading and appends it to local state.
   */
  createSensorReading(sensorReading: SensorReading): Observable<SensorReading> {
    return this.sensorReadingsEndpoint.create(sensorReading);
  }

  /**
   * @summary Requests backend-owned demo readings and returns the persisted resources.
   */
  generateDemoSensorReadings(
    request: GenerateDemoSensorReadingsRequest,
  ): Observable<SensorReading[]> {
    return this.sensorReadingsEndpoint.generateDemoReadings(request);
  }
}

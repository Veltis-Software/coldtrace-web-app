import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApi } from '../../shared/infrastructure/base-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { MaintenanceSchedule } from '../domain/model/maintenance-schedule.entity';
import { TechnicalServiceRequest } from '../domain/model/technical-service-request.entity';
import { MaintenanceSchedulesApiEndpoint } from './maintenance-schedules-api-endpoint';
import { TechnicalServiceRequestsApiEndpoint } from './technical-service-requests-api-endpoint';

/**
 * @summary Groups maintenance management API operations used by application stores and views.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceManagementApi extends BaseApi {
  private readonly maintenanceSchedulesEndpoint: MaintenanceSchedulesApiEndpoint;
  private readonly technicalServiceRequestsEndpoint: TechnicalServiceRequestsApiEndpoint;

  constructor(httpClient: HttpClient, organizationScope: OrganizationScopeStore) {
    super();
    this.maintenanceSchedulesEndpoint = new MaintenanceSchedulesApiEndpoint(
      httpClient,
      organizationScope,
    );
    this.technicalServiceRequestsEndpoint = new TechnicalServiceRequestsApiEndpoint(
      httpClient,
      organizationScope,
    );
  }

  /**
   * @summary Fetches maintenance schedules from the API endpoint.
   */
  getMaintenanceSchedules(): Observable<MaintenanceSchedule[]> {
    return this.maintenanceSchedulesEndpoint.getAll();
  }

  /**
   * @summary Persists a preventive maintenance schedule through the API endpoint.
   */
  createMaintenanceSchedule(
    maintenanceSchedule: MaintenanceSchedule,
  ): Observable<MaintenanceSchedule> {
    return this.maintenanceSchedulesEndpoint.create(maintenanceSchedule);
  }

  /**
   * @summary Updates a preventive maintenance schedule through the API endpoint.
   */
  updateMaintenanceSchedule(
    maintenanceSchedule: MaintenanceSchedule,
  ): Observable<MaintenanceSchedule> {
    return this.maintenanceSchedulesEndpoint.updateStatus(maintenanceSchedule);
  }

  /**
   * @summary Fetches technical service requests from the API endpoint.
   */
  getTechnicalServiceRequests(): Observable<TechnicalServiceRequest[]> {
    return this.technicalServiceRequestsEndpoint.getAll();
  }

  /**
   * @summary Persists a technical service request through the API endpoint.
   */
  createTechnicalServiceRequest(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    return this.technicalServiceRequestsEndpoint.create(technicalServiceRequest);
  }

  /**
   * @summary Updates a technical service request through the API endpoint.
   */
  updateTechnicalServiceRequest(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    return this.technicalServiceRequestsEndpoint.updateStatus(technicalServiceRequest);
  }
}

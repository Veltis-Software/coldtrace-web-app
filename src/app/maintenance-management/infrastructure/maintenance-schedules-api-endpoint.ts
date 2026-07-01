import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { MaintenanceSchedule } from '../domain/model/maintenance-schedule.entity';
import { MaintenanceScheduleAssembler } from './maintenance-schedule-assembler';
import {
  CreateMaintenanceScheduleRequest,
  MaintenanceScheduleResource,
  MaintenanceSchedulesResponse,
  UpdateMaintenanceScheduleStatusRequest,
} from './maintenance-schedules-response';

/**
 * @summary Connects maintenance schedules API endpoint resources to the generic API endpoint contract.
 */
export class MaintenanceSchedulesApiEndpoint extends BaseApiEndpoint<
  MaintenanceSchedule,
  MaintenanceScheduleResource,
  MaintenanceSchedulesResponse,
  MaintenanceScheduleAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new MaintenanceScheduleAssembler());
  }

  /**
   * @summary Fetches maintenance schedules for the active organization.
   */
  override getAll(): Observable<MaintenanceSchedule[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  override create(maintenanceSchedule: MaintenanceSchedule): Observable<MaintenanceSchedule> {
    const request: CreateMaintenanceScheduleRequest = {
      assetId: maintenanceSchedule.assetId,
      scheduledDate: this.dateTimeFrom(maintenanceSchedule.scheduledDate),
      observations: maintenanceSchedule.observations,
      status: maintenanceSchedule.status,
    };

    this.useActiveOrganizationEndpoint();

    return this.http.post<MaintenanceScheduleResource>(this.endpointUrl, request).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
    );
  }

  updateStatus(maintenanceSchedule: MaintenanceSchedule): Observable<MaintenanceSchedule> {
    const request: UpdateMaintenanceScheduleStatusRequest = {
      status: maintenanceSchedule.status,
    };

    this.useActiveOrganizationEndpoint();

    return this.http
      .patch<MaintenanceScheduleResource>(`${this.endpointUrl}/${maintenanceSchedule.id}`, request)
      .pipe(map((updated) => this.assembler.toEntityFromResource(updated)));
  }

  private dateTimeFrom(dateValue: string): string {
    return dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00Z`;
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('maintenance-schedules');
  }
}

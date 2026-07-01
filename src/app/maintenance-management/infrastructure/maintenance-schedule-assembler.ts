import { BaseAssembler } from '../../shared/infrastructure/base-assembler';
import { MaintenanceSchedule } from '../domain/model/maintenance-schedule.entity';
import {
  MaintenanceScheduleResource,
  MaintenanceSchedulesResponse,
} from './maintenance-schedules-response';

/**
 * @summary Maps maintenance schedule data between domain entities and API resources.
 */
export class MaintenanceScheduleAssembler implements BaseAssembler<
  MaintenanceSchedule,
  MaintenanceScheduleResource,
  MaintenanceSchedulesResponse
> {
  /**
   * @summary Maps an API response envelope into domain entities.
   */
  toEntitiesFromResponse(response: MaintenanceSchedulesResponse): MaintenanceSchedule[] {
    return response.maintenanceSchedules.map((resource) => this.toEntityFromResource(resource));
  }

  /**
   * @summary Maps one API resource into a domain entity.
   */
  toEntityFromResource(resource: MaintenanceScheduleResource): MaintenanceSchedule {
    return new MaintenanceSchedule(
      Number(resource.id),
      resource.organizationId,
      resource.uuid,
      resource.assetId,
      resource.iotDeviceId ?? null,
      resource.scheduledDate,
      resource.period ?? this.periodFrom(resource.scheduledDate),
      resource.observations,
      resource.status,
      resource.createdAt,
      resource.frequencyDays ?? null,
      resource.responsibleUserId ?? null,
    );
  }

  /**
   * @summary Maps one domain entity into an API resource.
   */
  toResourceFromEntity(entity: MaintenanceSchedule): MaintenanceScheduleResource {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      uuid: entity.uuid,
      assetId: entity.assetId,
      scheduledDate: entity.scheduledDate,
      period: entity.period,
      frequencyDays: entity.frequencyDays,
      responsibleUserId: entity.responsibleUserId,
      observations: entity.observations,
      status: entity.status,
      createdAt: entity.createdAt,
    };
  }

  private periodFrom(dateTime: string): string {
    return dateTime.slice(0, 7);
  }
}

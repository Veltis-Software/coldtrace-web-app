import { computed, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { MaintenanceSchedule } from '../domain/model/maintenance-schedule.entity';
import { MaintenanceScheduleStatus } from '../domain/model/maintenance-schedule-status.enum';
import { TechnicalServiceRequest } from '../domain/model/technical-service-request.entity';
import { TechnicalServiceStatus } from '../domain/model/technical-service-status.enum';
import { MaintenanceManagementApi } from '../infrastructure/maintenance-management-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';

interface LoadOptions {
  force?: boolean;
}

/**
 * @summary Manages maintenance management state and workflows for presentation components.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceManagementStore {
  private readonly maintenanceSchedulesSignal = signal<MaintenanceSchedule[]>([]);
  private readonly technicalServiceRequestsSignal = signal<TechnicalServiceRequest[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private maintenanceSchedulesLoadedForOrganizationId: number | null = null;
  private maintenanceSchedulesRequestInFlightForOrganizationId: number | null = null;
  private technicalServiceRequestsLoadedForOrganizationId: number | null = null;
  private technicalServiceRequestsRequestInFlightForOrganizationId: number | null = null;

  readonly maintenanceSchedules = this.maintenanceSchedulesSignal.asReadonly();
  readonly technicalServiceRequests = this.technicalServiceRequestsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly pendingCount = computed(() => {
    return this.maintenanceSchedules().filter((schedule) => this.isOpenSchedule(schedule)).length;
  });
  readonly openTechnicalServiceCount = computed(() => {
    return this.technicalServiceRequests().filter((request) => this.isOpenTechnicalService(request))
      .length;
  });

  constructor(
    private maintenanceManagementApi: MaintenanceManagementApi,
    private organizationScope: OrganizationScopeStore,
  ) {}

  /**
   * @summary Loads maintenance schedules data into local state.
   */
  loadMaintenanceSchedules(options: LoadOptions = {}): void {
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      this.maintenanceSchedulesSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.maintenanceSchedulesLoadedForOrganizationId === organizationId ||
        this.maintenanceSchedulesRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.maintenanceSchedulesRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.maintenanceManagementApi.getMaintenanceSchedules().subscribe({
      next: (maintenanceSchedules) => {
        this.maintenanceSchedulesSignal.set(maintenanceSchedules);
        this.maintenanceSchedulesLoadedForOrganizationId = organizationId;
        this.maintenanceSchedulesRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.maintenanceSchedulesRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Loads technical service requests data into local state.
   */
  loadTechnicalServiceRequests(options: LoadOptions = {}): void {
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      this.technicalServiceRequestsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.technicalServiceRequestsLoadedForOrganizationId === organizationId ||
        this.technicalServiceRequestsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.technicalServiceRequestsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.maintenanceManagementApi.getTechnicalServiceRequests().subscribe({
      next: (technicalServiceRequests) => {
        this.technicalServiceRequestsSignal.set(technicalServiceRequests);
        this.technicalServiceRequestsLoadedForOrganizationId = organizationId;
        this.technicalServiceRequestsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.technicalServiceRequestsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Creates a preventive maintenance schedule and appends it to local state.
   */
  createMaintenanceSchedule(
    maintenanceSchedule: MaintenanceSchedule,
  ): Observable<MaintenanceSchedule> {
    return this.maintenanceManagementApi.createMaintenanceSchedule(maintenanceSchedule).pipe(
      tap((createdSchedule) => {
        this.maintenanceSchedulesSignal.update((schedules) => [...schedules, createdSchedule]);
        this.maintenanceSchedulesLoadedForOrganizationId =
          this.organizationScope.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Updates a preventive maintenance schedule in local state after persistence.
   */
  updateMaintenanceSchedule(
    maintenanceSchedule: MaintenanceSchedule,
  ): Observable<MaintenanceSchedule> {
    return this.maintenanceManagementApi.updateMaintenanceSchedule(maintenanceSchedule).pipe(
      tap((updatedSchedule) => {
        this.maintenanceSchedulesSignal.update((schedules) =>
          schedules.map((schedule) =>
            schedule.id === updatedSchedule.id ? updatedSchedule : schedule,
          ),
        );
        this.maintenanceSchedulesLoadedForOrganizationId =
          this.organizationScope.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Creates a technical service request and appends it to local state.
   */
  createTechnicalServiceRequest(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    return this.maintenanceManagementApi
      .createTechnicalServiceRequest(technicalServiceRequest)
      .pipe(
        tap((createdRequest) => {
          this.technicalServiceRequestsSignal.update((requests) => [...requests, createdRequest]);
          this.technicalServiceRequestsLoadedForOrganizationId =
            this.organizationScope.activeOrganizationId();
        }),
      );
  }

  /**
   * @summary Updates a technical service request in local state after persistence.
   */
  updateTechnicalServiceRequest(
    technicalServiceRequest: TechnicalServiceRequest,
  ): Observable<TechnicalServiceRequest> {
    return this.maintenanceManagementApi
      .updateTechnicalServiceRequest(technicalServiceRequest)
      .pipe(
        tap((updatedRequest) => {
          this.technicalServiceRequestsSignal.update((requests) =>
            requests.map((request) =>
              request.id === updatedRequest.id ? updatedRequest : request,
            ),
          );
          this.technicalServiceRequestsLoadedForOrganizationId =
            this.organizationScope.activeOrganizationId();
        }),
      );
  }

  /**
   * @summary Returns schedules scoped to one organization.
   */
  schedulesForOrganization(organizationId: number | null): MaintenanceSchedule[] {
    if (!organizationId) {
      return [];
    }

    return this.maintenanceSchedules().filter(
      (schedule) => schedule.organizationId === organizationId,
    );
  }

  /**
   * @summary Calculates the next schedule id value.
   */
  nextScheduleId(): number {
    return Math.max(...this.maintenanceSchedules().map((schedule) => schedule.id), 0) + 1;
  }

  /**
   * @summary Checks whether an asset already has an open schedule for a period.
   */
  hasOpenScheduleForAssetPeriod(
    organizationId: number | null,
    assetId: number,
    period: string,
  ): boolean {
    return this.schedulesForOrganization(organizationId).some((schedule) => {
      return (
        schedule.assetId === assetId && schedule.period === period && this.isOpenSchedule(schedule)
      );
    });
  }

  /**
   * @summary Returns technical services scoped to one organization.
   */
  technicalServicesForOrganization(organizationId: number | null): TechnicalServiceRequest[] {
    if (!organizationId) {
      return [];
    }

    return this.technicalServiceRequests().filter(
      (request) => request.organizationId === organizationId,
    );
  }

  /**
   * @summary Calculates the next technical service request id value.
   */
  nextTechnicalServiceRequestId(): number {
    return Math.max(...this.technicalServiceRequests().map((request) => request.id), 0) + 1;
  }

  private isOpenSchedule(schedule: MaintenanceSchedule): boolean {
    return (
      schedule.status === MaintenanceScheduleStatus.Scheduled ||
      schedule.status === MaintenanceScheduleStatus.Pending
    );
  }

  private isOpenTechnicalService(request: TechnicalServiceRequest): boolean {
    return (
      request.status === TechnicalServiceStatus.Open ||
      request.status === TechnicalServiceStatus.PendingReview
    );
  }
}

import { Component, DestroyRef, computed, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { interval } from 'rxjs';

import { AlertsStore } from '../../../../alerts/application/alerts.store';
import { Incident } from '../../../../alerts/domain/model/incident.entity';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { Asset } from '../../../../asset-management/domain/model/asset.entity';
import { AssetStatus } from '../../../../asset-management/domain/model/asset-status.enum';
import { CalibrationStatus } from '../../../../asset-management/domain/model/calibration-status.enum';
import { GatewayStatus } from '../../../../asset-management/domain/model/gateway-status.enum';
import { IoTDeviceStatus } from '../../../../asset-management/domain/model/iot-device-status.enum';
import { AssetSettings } from '../../../../asset-management/domain/model/asset-settings.entity';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { MaintenanceManagementStore } from '../../../../maintenance-management/application/maintenance-management.store';
import { MaintenanceScheduleStatus } from '../../../../maintenance-management/domain/model/maintenance-schedule-status.enum';
import { TechnicalServiceStatus } from '../../../../maintenance-management/domain/model/technical-service-status.enum';
import { TELEMETRY_POLLING_INTERVAL_MS } from '../../../../shared/domain/model/polling-interval.constant';
import { MonitoringStore } from '../../../application/monitoring.store';
import { IncidentDay } from '../../../domain/model/incident-day.entity';
import { MaintenanceTask } from '../../../domain/model/maintenance-task.entity';
import { RecentAlert } from '../../../domain/model/recent-alert.entity';
import { SensorReading } from '../../../domain/model/sensor-reading.entity';
import { StorageDistributionItem } from '../../../domain/model/storage-distribution-item.entity';
import { TemperaturePoint } from '../../../domain/model/temperature-point.entity';
import { DashboardAiAssistant } from '../../components/dashboard-ai-assistant/dashboard-ai-assistant';
import { IncidentsChart } from '../../components/incidents-chart/incidents-chart';
import { MaintenanceList } from '../../components/maintenance-list/maintenance-list';
import { RecentAlerts } from '../../components/recent-alerts/recent-alerts';
import { DashboardKpi } from '../../components/stat-card/dashboard-kpi';
import { StatCard } from '../../components/stat-card/stat-card';
import { StorageDistribution } from '../../components/storage-distribution/storage-distribution';
import { TemperatureChart } from '../../components/temperature-chart/temperature-chart';

interface TemperatureLimits {
  min: number;
  max: number;
}

type ThermalState = 'frozen' | 'refrigerated' | 'ambient' | 'noData';

/**
 * @summary Presents the operational dashboard user interface in the monitoring bounded context.
 */
@Component({
  selector: 'app-operational-dashboard',
  standalone: true,
  imports: [
    TranslateModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StatCard,
    DashboardAiAssistant,
    TemperatureChart,
    StorageDistribution,
    MaintenanceList,
    RecentAlerts,
    IncidentsChart,
  ],
  templateUrl: './operational-dashboard.html',
  styleUrl: './operational-dashboard.css',
})
export class OperationalDashboard implements OnInit {
  protected readonly monitoringStore = inject(MonitoringStore);
  protected readonly assetStore = inject(AssetManagementStore);
  protected readonly alertsStore = inject(AlertsStore);
  protected readonly identityStore = inject(IdentityAccessStore);
  protected readonly maintenanceStore = inject(MaintenanceManagementStore);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeOrganizationId = computed(() => {
    return this.identityStore.currentOrganizationIdFrom(this.identityStore.users());
  });
  protected readonly organizationAssets = computed(() => {
    return this.assetStore.assetsForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationAssetIds = computed(() => {
    return this.organizationAssets().map((asset) => asset.id);
  });
  protected readonly organizationIoTDevices = computed(() => {
    return this.assetStore.iotDevicesForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationGateways = computed(() => {
    return this.assetStore.gatewaysForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationLocations = computed(() => {
    return this.assetStore.locationsForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationMaintenanceSchedules = computed(() => {
    return this.maintenanceStore.schedulesForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationTechnicalServices = computed(() => {
    return this.maintenanceStore.technicalServicesForOrganization(this.activeOrganizationId());
  });
  protected readonly organizationReadings = computed(() => {
    const since = new Date();
    since.setHours(since.getHours() - 24);
    return this.monitoringStore.readingsForAssetIdsSince(this.organizationAssetIds(), since);
  });
  protected readonly organizationIncidents = computed(() => this.alertsStore.incidents());
  protected readonly activeIncidents = computed(() =>
    this.organizationIncidents().filter((incident) => !incident.isClosed),
  );
  protected readonly activeCriticalIncidents = computed(() =>
    this.activeIncidents().filter((incident) => incident.severity === 'critical'),
  );
  protected readonly assetSummary = computed(() => {
    return this.assetStore.operationalSummaryFor(this.activeOrganizationId());
  });
  protected readonly currentSettings = computed(() => {
    return (
      this.assetStore.defaultSettingsForOrganization(this.activeOrganizationId()) ??
      this.assetStore.assetSettingsForOrganization(this.activeOrganizationId())[0] ??
      null
    );
  });
  protected readonly monitoredAssetsKpi = computed(() => this.buildMonitoredAssetsKpi());
  protected readonly criticalAlertsKpi = computed(() => this.buildCriticalAlertsKpi());
  protected readonly activeSensorsKpi = computed(() => this.buildActiveSensorsKpi());
  protected readonly incidentsKpi = computed(() => this.buildIncidentsKpi());
  protected readonly thermalCompliancePercent = computed(() => {
    return this.thermalComplianceFor(
      this.organizationReadings().filter((reading) => reading.temperature !== null),
    );
  });
  protected readonly thermalComplianceKpi = computed(() => this.buildThermalComplianceKpi());
  protected readonly temperaturePoints = computed(() => this.buildTemperaturePoints());
  protected readonly storageDistribution = computed(() => this.buildStorageDistribution());
  protected readonly maintenanceTasks = computed(() => this.buildMaintenanceTasks());
  protected readonly recentAlerts = computed(() => this.buildRecentAlerts());
  protected readonly incidentDays = computed(() => this.buildIncidentDays());
  protected readonly timeline = computed(() => this.buildTimeline());
  protected readonly maintenanceCompletionRate = computed(() => {
    const schedules = this.organizationMaintenanceSchedules().filter(
      (schedule) => schedule.status !== MaintenanceScheduleStatus.Canceled,
    );
    const technicalServices = this.organizationTechnicalServices();
    const total = schedules.length + technicalServices.length;

    if (!total) {
      return 0;
    }

    const completed =
      schedules.filter((schedule) => schedule.status === MaintenanceScheduleStatus.Completed)
        .length +
      technicalServices.filter((request) => request.status === TechnicalServiceStatus.Closed)
        .length;

    return Math.round((completed / total) * 100);
  });
  protected readonly activeOrganizationName = computed(() => {
    return this.identityStore.currentOrganizationNameFrom(
      this.identityStore.users(),
      this.identityStore.organizations(),
    );
  });
  protected readonly profileUserName = computed(() => {
    return this.identityStore.currentUserNameFrom(this.identityStore.users());
  });
  protected readonly profileRoleLabelKey = computed(() => {
    return this.identityStore.currentRoleLabelKeyFrom(
      this.identityStore.users(),
      this.identityStore.roles(),
    );
  });
  protected readonly canManageAccessValue = computed(() => {
    return this.identityStore.canManageAccess(
      this.identityStore.users(),
      this.identityStore.roles(),
    );
  });
  protected readonly identityLoading = computed(() => this.identityStore.loading());
  protected readonly maintenanceLoading = computed(() => this.maintenanceStore.loading());
  protected readonly alertsLoading = computed(() => this.alertsStore.loading());
  protected readonly assetIssueCount = computed(() => this.assetSummary().assetsWithIssues);
  protected readonly hasOperationalData = computed(() => {
    return (
      this.assetSummary().totalAssets > 0 ||
      this.organizationIoTDevices().length > 0 ||
      this.organizationGateways().length > 0 ||
      this.organizationMaintenanceSchedules().length > 0 ||
      this.organizationTechnicalServices().length > 0 ||
      this.organizationReadings().length > 0 ||
      this.organizationIncidents().length > 0
    );
  });

  /**
   * @summary Initializes the operational dashboard view state.
   */
  ngOnInit(): void {
    this.identityStore.loadUsers();
    this.identityStore.loadOrganizations();
    this.identityStore.loadRoles();
    this.assetStore.loadAssets();
    this.assetStore.loadIoTDevices();
    this.assetStore.loadGateways();
    this.assetStore.loadLocations();
    this.assetStore.loadAssetSettings();
    this.maintenanceStore.loadMaintenanceSchedules();
    this.maintenanceStore.loadTechnicalServiceRequests();
    this.alertsStore.loadIncidents({ evaluateReadings: true });
    this.monitoringStore.loadReadings();
    this.startReadingsUpdates();
  }

  protected logout(): void {
    this.identityStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  private startReadingsUpdates(): void {
    interval(TELEMETRY_POLLING_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.monitoringStore.updateOrganizationTelemetry(this.activeOrganizationId());
      });
  }

  private buildMonitoredAssetsKpi(): DashboardKpi {
    const summary = this.assetSummary();

    return this.kpi({
      id: 1,
      key: 'monitored-assets',
      title: 'monitoring.operational.metric-monitored',
      value: `${summary.monitoredAssets}`,
      valueUnit: 'monitoring.operational.unit-assets',
      size: 'large',
      color: {
        bg: '#3B66F5',
        border: '#3B66F5',
        text: '#FFFFFF',
        chart: 'rgba(255,255,255,0.7)',
      },
      tooltip: {
        text: 'monitoring.operational.label-monitored',
        position: 82,
      },
      chartData: this.buildSummaryBars(
        [
          summary.totalAssets,
          summary.monitoredAssets,
          summary.connectedDevices,
          summary.connectedGateways,
          summary.assetsWithIssues,
          this.organizationReadings().length,
        ],
        13,
      ),
      highlightedBar: 10,
      showAnchor: false,
    });
  }

  private buildCriticalAlertsKpi(): DashboardKpi {
    const criticalCount = this.activeCriticalIncidents().length;

    return this.kpi({
      id: 2,
      key: 'critical-alerts',
      title: 'monitoring.operational.metric-critical-alerts',
      value: `${criticalCount}`,
      valueUnit: 'monitoring.operational.label-open',
      size: 'large',
      type: 'wave',
      color: {
        bg: '#8B31E3',
        border: '#8B31E3',
        text: '#FFFFFF',
        chart: 'rgba(255,255,255,0.8)',
      },
      tooltip: {
        text: 'monitoring.operational.label-open',
        position: 52,
      },
      chartData: [],
      highlightedBar: -1,
      showAnchor: true,
    });
  }

  private buildActiveSensorsKpi(): DashboardKpi {
    const summary = this.assetSummary();
    const linkedDevices = this.organizationIoTDevices().filter(
      (iotDevice) => iotDevice.status === IoTDeviceStatus.Linked,
    ).length;
    const availableDevices = this.organizationIoTDevices().filter(
      (iotDevice) => iotDevice.status === IoTDeviceStatus.Available,
    ).length;
    const offlineDevices = this.organizationIoTDevices().filter(
      (iotDevice) => iotDevice.status === IoTDeviceStatus.Offline,
    ).length;

    return this.kpi({
      id: 3,
      key: 'active-sensors',
      title: 'monitoring.operational.metric-sensors',
      value: `${linkedDevices}`,
      valueUnit: 'monitoring.operational.unit-devices',
      size: 'small',
      color: {
        bg: '#D8F0FF',
        border: '#D8F0FF',
        text: '#3B66F5',
        chart: '#3B66F5',
      },
      tooltip: {
        text: 'monitoring.operational.label-linked',
        position: 82,
      },
      chartData: this.buildStatusBars([
        linkedDevices,
        availableDevices,
        offlineDevices,
        summary.connectedGateways,
      ]),
      highlightedBar: 8,
      showAnchor: false,
    });
  }

  private buildIncidentsKpi(): DashboardKpi {
    const activeIncidents = this.activeIncidents();
    const count = activeIncidents.length;
    const openCount = activeIncidents.filter((incident) => incident.isOpen).length;
    const recognizedCount = activeIncidents.filter((incident) => incident.isRecognized).length;
    const warningCount = activeIncidents.filter((incident) => incident.severity === 'warning').length;
    const criticalCount = activeIncidents.filter((incident) => incident.severity === 'critical').length;

    return this.kpi({
      id: 4,
      key: 'incidents',
      title: 'monitoring.operational.metric-incidents',
      value: `${count}`,
      valueUnit: 'monitoring.operational.label-open',
      size: 'small',
      color: {
        bg: '#F2E6FF',
        border: '#F2E6FF',
        text: '#8B31E3',
        chart: '#8B31E3',
      },
      tooltip: {
        text: 'monitoring.operational.label-open',
        position: 78,
      },
      chartData: this.buildStatusBars([
        openCount,
        recognizedCount,
        warningCount,
        criticalCount,
      ]),
      highlightedBar: 5,
      showAnchor: false,
    });
  }

  private buildThermalComplianceKpi(): DashboardKpi {
    const thermalReadings = this.organizationReadings().filter(
      (reading) => reading.temperature !== null,
    );
    const compliance = this.thermalCompliancePercent();

    return this.kpi({
      id: 5,
      key: 'thermal-compliance',
      title: 'monitoring.operational.metric-compliance',
      value: `${compliance}%`,
      valueUnit: 'monitoring.operational.label-in-range',
      size: 'small',
      color: {
        bg: '#E6F9EB',
        border: '#E6F9EB',
        text: '#10B981',
        chart: '#10B981',
      },
      tooltip: {
        text: 'monitoring.operational.label-avg',
        position: 85,
      },
      chartData: this.buildStatusBars(
        thermalReadings
          .slice(0, 11)
          .map((reading) => (this.isThermalReadingInRange(reading) ? 92 : 42)),
      ),
      highlightedBar: 9,
      showAnchor: false,
    });
  }

  private buildTemperaturePoints(): TemperaturePoint[] {
    const { max: maxLimit, min: minLimit } = this.currentTemperatureLimits();
    const readings = this.organizationReadings().filter((reading) => reading.temperature !== null);

    if (!readings.length) {
      return [];
    }

    const now = new Date();
    const initialTemperature =
      [...readings].sort(
        (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime(),
      )[0]?.temperature ?? (minLimit + maxLimit) / 2;
    let previousTemperature = initialTemperature;

    return Array.from({ length: 24 }, (_, index) => {
      const bucketStart = new Date(now);
      bucketStart.setMinutes(0, 0, 0);
      bucketStart.setHours(bucketStart.getHours() - (23 - index));

      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(bucketEnd.getHours() + 1);

      const readingsInBucket = readings.filter((reading) => {
        const recordedAt = new Date(reading.recordedAt).getTime();
        return recordedAt >= bucketStart.getTime() && recordedAt < bucketEnd.getTime();
      });
      const temperature = readingsInBucket.length
        ? this.average(
            readingsInBucket.map((reading) => reading.temperature ?? previousTemperature),
          )
        : previousTemperature;
      const point = new TemperaturePoint({
        id: index + 1,
        label: this.hourLabel(bucketStart.toISOString()),
        temperature: Number(temperature.toFixed(1)),
        ghost: Number(previousTemperature.toFixed(1)),
        maxLimit,
        minLimit,
      });

      previousTemperature = point.temperature;
      return point;
    });
  }

  private buildStorageDistribution(): StorageDistributionItem[] {
    const assets = this.organizationAssets();
    const total = assets.length;

    if (!total) {
      return [];
    }

    const latestReadingsByAssetId = this.latestTemperatureReadingsByAssetId();
    const counts: Record<ThermalState, number> = {
      frozen: 0,
      refrigerated: 0,
      ambient: 0,
      noData: 0,
    };

    assets.forEach((asset) => {
      counts[this.thermalStateForAsset(asset, latestReadingsByAssetId)] += 1;
    });

    const groups = [
      {
        id: 1,
        label: 'monitoring.operational.storage-frozen',
        count: counts.frozen,
        color: '#91BDFF',
      },
      {
        id: 2,
        label: 'monitoring.operational.storage-refrigerated',
        count: counts.refrigerated,
        color: '#51BD7A',
      },
      {
        id: 3,
        label: 'monitoring.operational.storage-ambient',
        count: counts.ambient,
        color: '#F5BD38',
      },
      {
        id: 4,
        label: 'monitoring.operational.storage-other',
        count: counts.noData,
        color: '#9AA3AF',
      },
    ];

    return groups.map(
      (group) =>
        new StorageDistributionItem({
          id: group.id,
          label: group.label,
          assetCount: group.count,
          percentage: Number(((group.count / total) * 100).toFixed(1)),
          color: group.color,
        }),
    );
  }

  private latestTemperatureReadingsByAssetId(): Map<number, SensorReading> {
    const readingsByAssetId = new Map<number, SensorReading>();

    this.organizationReadings().forEach((reading) => {
      if (reading.temperature === null || readingsByAssetId.has(reading.assetId)) {
        return;
      }

      readingsByAssetId.set(reading.assetId, reading);
    });

    return readingsByAssetId;
  }

  private thermalStateForAsset(
    asset: Asset,
    readingsByAssetId: Map<number, SensorReading>,
  ): ThermalState {
    const reading = readingsByAssetId.get(asset.id);
    const settings = this.assetStore.settingsForAsset(this.activeOrganizationId(), asset.id);

    if (!reading || reading.temperature === null || !settings) {
      return 'noData';
    }

    if (reading.temperature <= 0) {
      return 'frozen';
    }

    if (reading.temperature <= settings.maximumTemperature) {
      return 'refrigerated';
    }

    return 'ambient';
  }

  private buildMaintenanceTasks(): MaintenanceTask[] {
    const technicalServiceTasks = this.organizationTechnicalServices()
      .filter((request) => request.status !== TechnicalServiceStatus.Closed)
      .sort((left, right) => this.priorityForRequest(right.priority) - this.priorityForRequest(left.priority))
      .slice(0, 3)
      .map(
        (request, index) =>
          new MaintenanceTask({
            id: index + 1,
            label: `${request.uuid} · ${this.assetNameFor(request.assetId)}`,
            icon: this.iconForTechnicalService(request.priority),
            status: request.status === TechnicalServiceStatus.PendingReview ? 'doing' : 'to-do',
          }),
      );

    const preventiveTasks = this.organizationMaintenanceSchedules()
      .filter((schedule) => schedule.status !== MaintenanceScheduleStatus.Canceled)
      .sort(
        (left, right) =>
          this.maintenanceStatusWeight(left.status) - this.maintenanceStatusWeight(right.status) ||
          new Date(left.scheduledDate).getTime() - new Date(right.scheduledDate).getTime(),
      )
      .slice(0, Math.max(0, 5 - technicalServiceTasks.length))
      .map(
        (schedule, index) =>
          new MaintenanceTask({
            id: technicalServiceTasks.length + index + 1,
            label: this.maintenanceScheduleLabel(schedule.assetId, schedule.iotDeviceId),
            icon: schedule.iotDeviceId ? 'sensors' : 'inventory_2',
            status: this.maintenanceTaskStatus(schedule.status),
          }),
      );

    const maintenanceTasks = [...technicalServiceTasks, ...preventiveTasks];

    if (maintenanceTasks.length) {
      return maintenanceTasks.slice(0, 5);
    }

    return this.buildOperationalMaintenanceFallbackTasks();
  }

  private buildOperationalMaintenanceFallbackTasks(): MaintenanceTask[] {
    const calibrationTasks = this.organizationIoTDevices()
      .filter((iotDevice) => iotDevice.calibrationStatus !== CalibrationStatus.Compliant)
      .slice(0, 3)
      .map(
        (iotDevice, index) =>
          new MaintenanceTask({
            id: index + 1,
            label: `${iotDevice.uuid} · ${iotDevice.model}`,
            icon: iotDevice.calibrationStatus === CalibrationStatus.Expired ? 'warning' : 'sensors',
            status: iotDevice.calibrationStatus === CalibrationStatus.Expired ? 'to-do' : 'doing',
          }),
      );

    const gatewayTasks = this.organizationGateways()
      .filter((gateway) => gateway.status !== GatewayStatus.Active)
      .slice(0, Math.max(0, 5 - calibrationTasks.length))
      .map(
        (gateway, index) =>
          new MaintenanceTask({
            id: calibrationTasks.length + index + 1,
            label: `${gateway.uuid} · ${this.gatewayLocationFor(gateway.locationId)}`,
            icon: gateway.status === GatewayStatus.Offline ? 'wifi_off' : 'router',
            status: gateway.status === GatewayStatus.Offline ? 'to-do' : 'doing',
          }),
      );

    const assetTasks = this.organizationAssets()
      .filter((asset) => asset.status === AssetStatus.Maintenance)
      .slice(0, Math.max(0, 5 - calibrationTasks.length - gatewayTasks.length))
      .map(
        (asset, index) =>
          new MaintenanceTask({
            id: calibrationTasks.length + gatewayTasks.length + index + 1,
            label: `${asset.uuid} · ${asset.name}`,
            icon: 'inventory_2',
            status: 'doing',
          }),
      );

    return [...calibrationTasks, ...gatewayTasks, ...assetTasks].slice(0, 5);
  }

  private maintenanceScheduleLabel(assetId: number, iotDeviceId: number | null): string {
    const iotDevice = iotDeviceId
      ? this.organizationIoTDevices().find((device) => device.id === iotDeviceId)
      : null;

    if (iotDevice) {
      return `${iotDevice.uuid} · ${iotDevice.model}`;
    }

    const asset = this.organizationAssets().find((currentAsset) => currentAsset.id === assetId);

    return asset ? `${asset.uuid} · ${asset.name}` : `Asset #${assetId}`;
  }

  private assetNameFor(assetId: number): string {
    return this.organizationAssets().find((asset) => asset.id === assetId)?.name ?? `Asset #${assetId}`;
  }

  private gatewayLocationFor(locationId: number): string {
    return this.assetStore.locationNameById(locationId, this.organizationLocations());
  }

  private maintenanceTaskStatus(
    status: MaintenanceScheduleStatus,
  ): 'to-do' | 'doing' | 'done' {
    if (status === MaintenanceScheduleStatus.Completed) {
      return 'done';
    }

    return status === MaintenanceScheduleStatus.Pending ? 'doing' : 'to-do';
  }

  private maintenanceStatusWeight(status: MaintenanceScheduleStatus): number {
    if (status === MaintenanceScheduleStatus.Pending) {
      return 0;
    }

    if (status === MaintenanceScheduleStatus.Scheduled) {
      return 1;
    }

    return 2;
  }

  private priorityForRequest(priority: string): number {
    const weights: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return weights[priority] ?? 0;
  }

  private iconForTechnicalService(priority: string): string {
    return priority === 'critical' || priority === 'high' ? 'build_circle' : 'construction';
  }

  private buildRecentAlerts(): RecentAlert[] {
    return [...this.activeIncidents()]
      .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime())
      .slice(0, 5)
      .map(
        (incident) =>
          new RecentAlert({
            id: incident.id,
            assetName: incident.assetName,
            type: this.incidentTypeKey(incident),
            value: incident.value,
            date: this.formatDate(incident.detectedAt),
            status: incident.isRecognized ? 'Acknowledged' : 'Unacknowledged',
            severity: incident.severity,
            icon: this.incidentIcon(incident),
          }),
      );
  }

  private buildIncidentDays(): IncidentDay[] {
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const days = dayLabels.map((label, index) => ({
      id: index + 1,
      label,
      normal: 0,
      warning: 0,
      critical: 0,
      offline: 0,
    }));

    this.applyIncidentRecords(days, this.incidentsSince(this.startOfCurrentWeek()), (incident) => {
      const day = new Date(incident.detectedAt).getDay();
      return day === 0 ? 6 : day - 1;
    });

    return days.map((day) => new IncidentDay(day));
  }

  private buildTimeline(): IncidentDay[] {
    const hours = Array.from({ length: 24 }, (_, index) => ({
      id: index + 1,
      label: `${index.toString().padStart(2, '0')}h`,
      normal: 0,
      warning: 0,
      critical: 0,
      offline: 0,
    }));

    const since = new Date();
    since.setHours(since.getHours() - 24);
    this.applyIncidentRecords(hours, this.incidentsSince(since), (incident) =>
      new Date(incident.detectedAt).getHours(),
    );

    return hours.map((hour) => new IncidentDay(hour));
  }

  private applyIncidentRecords(
    buckets: { normal: number; warning: number; critical: number; offline: number }[],
    incidents: Incident[],
    indexFor: (incident: Incident) => number,
  ): void {
    incidents.forEach((incident) => {
      const bucket = buckets[indexFor(incident)];

      if (!bucket) {
        return;
      }

      if (incident.isClosed) {
        bucket.normal += 1;
      } else if (incident.type === 'connectivity' || incident.conditionKey === 'low-signal') {
        bucket.offline += 1;
      } else if (incident.severity === 'critical') {
        bucket.critical += 1;
      } else {
        bucket.warning += 1;
      }
    });
  }

  private incidentsSince(since: Date): Incident[] {
    const sinceTime = since.getTime();

    return this.organizationIncidents().filter((incident) => {
      const detectedAt = new Date(incident.detectedAt).getTime();
      return Number.isFinite(detectedAt) && detectedAt >= sinceTime;
    });
  }

  private startOfCurrentWeek(): Date {
    const date = new Date();
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + mondayOffset);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private incidentTypeKey(incident: Incident): string {
    switch (incident.conditionKey) {
      case 'high-temperature':
        return 'monitoring.operational.type-high-temp';
      case 'low-temperature':
        return 'monitoring.operational.type-low-temp';
      case 'high-humidity':
        return 'monitoring.operational.type-high-humidity';
      case 'low-humidity':
        return 'monitoring.operational.type-low-humidity';
      case 'low-battery':
        return 'monitoring.operational.type-low-battery';
      case 'low-signal':
        return 'monitoring.operational.type-low-signal';
      case 'thermal-configuration-pending':
        return 'monitoring.operational.type-configuration';
      default:
        break;
    }

    if (incident.type === 'connectivity') {
      return 'monitoring.operational.type-connectivity';
    }

    if (incident.type === 'humidity') {
      return 'monitoring.operational.type-high-humidity';
    }

    if (incident.type === 'temperature') {
      return 'monitoring.operational.type-high-temp';
    }

    return 'monitoring.operational.type-other';
  }

  private incidentIcon(incident: Incident): string {
    switch (incident.conditionKey) {
      case 'low-temperature':
        return 'ac_unit';
      case 'high-temperature':
        return 'device_thermostat';
      case 'high-humidity':
      case 'low-humidity':
        return 'water_drop';
      case 'low-battery':
        return 'battery_alert';
      case 'low-signal':
        return 'signal_wifi_bad';
      default:
        break;
    }

    if (incident.type === 'connectivity') {
      return 'wifi_off';
    }

    if (incident.type === 'humidity') {
      return 'water_drop';
    }

    if (incident.type === 'temperature') {
      return 'device_thermostat';
    }

    return 'report_problem';
  }

  private alertTypeKey(reading: SensorReading): string {
    const settings = this.settingsForReading(reading);

    if (
      settings &&
      reading.humidity !== null &&
      this.isHumidityOutOfRange(reading.humidity, settings)
    ) {
      return reading.humidity > settings.maximumHumidity
        ? 'monitoring.operational.type-high-humidity'
        : 'monitoring.operational.type-low-humidity';
    }

    if (reading.motionDetected) {
      return 'monitoring.operational.type-motion-detected';
    }

    if (reading.imageCaptured) {
      return 'monitoring.operational.type-image-captured';
    }

    if (reading.batteryLevel !== null && reading.batteryLevel < 15) {
      return 'monitoring.operational.type-low-battery';
    }

    if (reading.signalStrength !== null && reading.signalStrength < 35) {
      return 'monitoring.operational.type-low-signal';
    }

    return settings &&
      reading.temperature !== null &&
      reading.temperature > settings.maximumTemperature
      ? 'monitoring.operational.type-high-temp'
      : 'monitoring.operational.type-low-temp';
  }

  private readingValueLabel(reading: SensorReading): string {
    const values = [
      reading.temperature !== null ? `${reading.temperature.toFixed(1)}°C` : null,
      reading.humidity !== null ? `${reading.humidity}%` : null,
      reading.motionDetected !== null
        ? this.translate.instant(
            reading.motionDetected
              ? 'monitoring.operational.reading-motion'
              : 'monitoring.operational.reading-no-motion',
          )
        : null,
      reading.imageCaptured !== null
        ? this.translate.instant(
            reading.imageCaptured
              ? 'monitoring.operational.reading-image-captured'
              : 'monitoring.operational.reading-no-image',
          )
        : null,
      reading.batteryLevel !== null
        ? `${reading.batteryLevel}% ${this.translate.instant('monitoring.operational.reading-battery')}`
        : null,
      reading.signalStrength !== null
        ? `${reading.signalStrength}% ${this.translate.instant('monitoring.operational.reading-signal')}`
        : null,
    ].filter((value): value is string => !!value);

    return values.join(' / ') || '—';
  }

  private readingIcon(reading: SensorReading): string {
    if (reading.motionDetected) {
      return 'directions_run';
    }

    if (reading.imageCaptured) {
      return 'photo_camera';
    }

    if (reading.batteryLevel !== null && reading.batteryLevel < 15) {
      return 'battery_alert';
    }

    return 'sensors';
  }

  private isHumidityOutOfRange(humidity: number, settings: AssetSettings): boolean {
    return humidity < settings.minimumHumidity || humidity > settings.maximumHumidity;
  }

  private getThermalSeverity(
    temperature: number,
    settings: AssetSettings | null,
  ): 'normal' | 'warning' | 'critical' {
    if (!settings) {
      return 'normal';
    }

    if (
      temperature > settings.maximumTemperature + 2 ||
      temperature < settings.minimumTemperature - 2
    ) {
      return 'critical';
    }

    if (temperature > settings.maximumTemperature || temperature < settings.minimumTemperature) {
      return 'warning';
    }

    return 'normal';
  }

  private getThermalIcon(temperature: number, settings: AssetSettings | null): string {
    if (!settings) {
      return 'device_thermostat';
    }

    return temperature > settings.maximumTemperature ? 'device_thermostat' : 'ac_unit';
  }

  private thermalComplianceFor(readings: SensorReading[]): number {
    if (!readings.length) {
      return 0;
    }

    const compliantReadings = readings.filter((reading) => this.isThermalReadingInRange(reading))
      .length;

    return Math.round((compliantReadings / readings.length) * 100);
  }

  private isThermalReadingInRange(reading: SensorReading): boolean {
    const settings = this.settingsForReading(reading);

    if (!settings || reading.temperature === null) {
      return false;
    }

    return (
      reading.temperature >= settings.minimumTemperature &&
      reading.temperature <= settings.maximumTemperature
    );
  }

  private settingsForReading(reading: SensorReading): AssetSettings | null {
    return this.assetStore.settingsForAsset(this.activeOrganizationId(), reading.assetId) ?? null;
  }

  private buildSummaryBars(values: number[], size: number): number[] {
    const baseValues = values.filter((value) => value > 0);

    if (!baseValues.length) {
      return [];
    }

    const max = Math.max(...baseValues, 1);
    const bars = Array.from({ length: size }, (_, index) => {
      const source = baseValues[index % baseValues.length];
      const variation = index % 2 === 0 ? 1 : 0.72;
      return Math.max(18, Math.round((source / max) * 100 * variation));
    });

    return bars;
  }

  private buildStatusBars(values: number[]): number[] {
    const baseValues = values.length ? values : [0];
    const max = Math.max(...baseValues, 1);

    return Array.from({ length: 11 }, (_, index) => {
      const source = baseValues[index % baseValues.length];
      return Math.max(16, Math.round((source / max) * 100));
    });
  }

  private hourLabel(date: string): string {
    return `${new Date(date).getHours().toString().padStart(2, '0')}:00`;
  }

  private currentTemperatureLimits(): TemperatureLimits {
    const settings = this.currentSettings();

    if (settings) {
      return {
        min: settings.minimumTemperature,
        max: settings.maximumTemperature,
      };
    }

    return this.temperatureLimitsFromValues(
      this.organizationReadings().map((reading) => reading.temperature),
    );
  }

  private temperatureLimitsFromValues(values: Array<number | null>): TemperatureLimits {
    const temperatures = values.filter(
      (temperature): temperature is number =>
        temperature !== null && Number.isFinite(temperature),
    );

    if (!temperatures.length) {
      return { min: 0, max: 1 };
    }

    const min = Math.min(...temperatures);
    const max = Math.max(...temperatures);

    if (min === max) {
      return {
        min: Math.floor(min - 1),
        max: Math.ceil(max + 1),
      };
    }

    return {
      min: Math.floor(min),
      max: Math.ceil(max),
    };
  }

  private average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  }

  private formatDate(date: string): string {
    const locale = this.translate.currentLang === 'es' ? 'es-PE' : 'en-GB';

    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  }

  private kpi(config: ConstructorParameters<typeof DashboardKpi>[0]): DashboardKpi {
    return new DashboardKpi(config);
  }
}

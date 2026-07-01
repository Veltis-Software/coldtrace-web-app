import { computed, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AssetManagementStore } from '../../asset-management/application/asset-management.store';
import { IoTDeviceStatus } from '../../asset-management/domain/model/iot-device-status.enum';
import { OfflineReading } from '../domain/model/offline-reading.entity';
import { SensorReading } from '../domain/model/sensor-reading.entity';
import { SyncStatus } from '../domain/model/sync-status.enum';
import { MonitoringApi } from '../infrastructure/monitoring-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';

interface LoadOptions {
  force?: boolean;
}

/**
 * @summary Manages monitoring state and workflows for presentation components.
 */
@Injectable({ providedIn: 'root' })
export class MonitoringStore {
  private readonly readingsSignal = signal<SensorReading[]>([]);
  private readonly offlineReadingsSignal = signal<OfflineReading[]>([]);
  private readonly loadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);
  private readingsLoadedForOrganizationId: number | null = null;
  private readingsRequestInFlightForOrganizationId: number | null = null;

  readonly readings = this.readingsSignal.asReadonly();
  readonly offlineReadings = this.offlineReadingsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly totalAssets = computed(
    () => new Set(this.readings().map((reading) => reading.assetId)).size,
  );
  readonly assetsWithAlerts = computed(
    () =>
      new Set(
        this.readings()
          .filter((reading) => reading.isOutOfRange)
          .map((reading) => reading.assetId),
      ).size,
  );
  readonly outOfRangeReadings = computed(() =>
    this.readings().filter((reading) => reading.isOutOfRange),
  );

  readonly pendingCount = computed(
    () => this.offlineReadings().filter((reading) => reading.isPending).length,
  );
  readonly syncedCount = computed(
    () => this.offlineReadings().filter((reading) => reading.isSynced).length,
  );
  readonly failedCount = computed(
    () => this.offlineReadings().filter((reading) => reading.isFailed).length,
  );

  private readonly seededOrganizationIds = new Set<number>();

  constructor(
    private monitoringApi: MonitoringApi,
    private assetManagementStore: AssetManagementStore,
    private organizationScope: OrganizationScopeStore,
  ) {}

  /**
   * @summary Loads readings data into local state.
   */
  loadReadings(options: LoadOptions = {}): void {
    const organizationId = this.organizationScope.activeOrganizationId();

    if (!organizationId) {
      this.readingsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.readingsLoadedForOrganizationId === organizationId ||
        this.readingsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.readingsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.monitoringApi.getSensorReadings().subscribe({
      next: (readings) => {
        this.readingsSignal.set(readings);
        this.readingsLoadedForOrganizationId = organizationId;
        this.readingsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
        this.initOfflineReadings(readings);
      },
      error: (error) => {
        this.errorSignal.set(this.formatError(error, 'Failed to load sensor readings'));
        this.readingsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Persists a sensor reading and appends it to local state.
   */
  createSensorReading(sensorReading: SensorReading): Observable<SensorReading> {
    return this.monitoringApi.createSensorReading(sensorReading).pipe(
      tap((createdReading) => {
        this.readingsSignal.update((readings) => [...readings, createdReading]);
        this.readingsLoadedForOrganizationId = this.organizationScope.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Calculates the next sensor reading id value.
   */
  nextSensorReadingId(offset = 0): number {
    return Math.max(...this.readings().map((reading) => reading.id), 0) + 1 + offset;
  }

  /**
   * @summary Returns the latest temperature recorded for one asset.
   */
  getLatestTemperatureByAsset(assetId: number): number | null {
    const sorted = this.readings()
      .filter((reading) => reading.assetId === assetId && reading.temperature !== null)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    return sorted.length > 0 ? sorted[0].temperature : null;
  }

  /**
   * @summary Returns the latest humidity recorded for one asset.
   */
  getLatestHumidityByAsset(assetId: number): number | null {
    const sorted = this.readings()
      .filter((reading) => reading.assetId === assetId && reading.humidity !== null)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    return sorted.length > 0 ? sorted[0].humidity : null;
  }

  /**
   * @summary Returns sorted readings for an asset within an optional date range.
   */
  getReadingsByAsset(assetId: number, from?: string, to?: string): SensorReading[] {
    return this.readings()
      .filter((reading) => {
        if (reading.assetId !== assetId) return false;
        const time = new Date(reading.recordedAt).getTime();
        if (from && time < new Date(from).getTime()) return false;
        if (to && time > new Date(to).getTime() + 86399999) return false;
        return true;
      })
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  /**
   * @summary Returns sorted readings for a set of assets.
   */
  readingsForAssetIds(assetIds: number[]): SensorReading[] {
    const assetIdSet = new Set(assetIds);

    return this.readings()
      .filter((reading) => assetIdSet.has(reading.assetId))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  /**
   * @summary Returns the latest readings for dashboard cards.
   */
  recentReadingsForAssetIds(assetIds: number[], limit = 6): SensorReading[] {
    return this.readingsForAssetIds(assetIds).slice(0, limit);
  }

  /**
   * @summary Returns readings for assets recorded between a date and now.
   */
  readingsForAssetIdsSince(assetIds: number[], since: Date): SensorReading[] {
    const sinceTime = since.getTime();
    const nowTime = Date.now();

    return this.readingsForAssetIds(assetIds).filter((reading) => {
      const readingTime = new Date(reading.recordedAt).getTime();
      return readingTime >= sinceTime && readingTime <= nowTime;
    });
  }

  /**
   * @summary Counts out-of-range readings for selected assets.
   */
  outOfRangeCountForAssetIds(assetIds: number[]): number {
    return this.readingsForAssetIds(assetIds).filter((reading) => reading.isOutOfRange).length;
  }

  /**
   * @summary Calculates the percentage of in-range readings for selected assets.
   */
  thermalComplianceForAssetIds(assetIds: number[]): number {
    const readings = this.readingsForAssetIds(assetIds);

    if (!readings.length) {
      return 0;
    }

    const inRangeReadings = readings.filter((reading) => !reading.isOutOfRange).length;
    return Math.round((inRangeReadings / readings.length) * 100);
  }

  /**
   * @summary Marks one offline reading as synced.
   */
  syncReading(id: number): void {
    this.offlineReadingsSignal.update((list) =>
      list.map((reading) =>
        reading.id === id ? reading.withSyncStatus(SyncStatus.Synced) : reading,
      ),
    );
  }

  /**
   * @summary Marks all pending offline readings as synced.
   */
  syncAllPending(): void {
    this.offlineReadingsSignal.update((list) =>
      list.map((reading) =>
        reading.isPending ? reading.withSyncStatus(SyncStatus.Synced) : reading,
      ),
    );
  }

  /**
   * @summary Requests backend-owned telemetry updates for one organization.
   */
  updateOrganizationTelemetry(organizationId: number | null): void {
    if (!organizationId) {
      return;
    }

    const assets = this.assetManagementStore.assetsForOrganization(organizationId);
    const monitoredAssets = assets.filter((asset) =>
      this.assetManagementStore
        .iotDevicesForAsset(asset.id)
        .some((device) => device.status !== IoTDeviceStatus.Offline),
    );

    if (!monitoredAssets.length) {
      return;
    }

    const seededInitialReadings = this.ensureRecentReadingsForOrganization(
      organizationId,
      monitoredAssets.map((asset) => asset.id),
    );

    if (seededInitialReadings) {
      return;
    }

    this.generateDemoReadings({ count: 1 });
  }

  private ensureRecentReadingsForOrganization(
    organizationId: number,
    assetIds: number[],
  ): boolean {
    if (this.seededOrganizationIds.has(organizationId)) {
      return false;
    }

    const since = new Date();
    since.setHours(since.getHours() - 24);

    if (this.readingsForAssetIdsSince(assetIds, since).length) {
      this.seededOrganizationIds.add(organizationId);
      return false;
    }

    this.generateDemoReadings({ count: 8 });
    this.seededOrganizationIds.add(organizationId);
    return true;
  }

  private generateDemoReadings(request: { assetId?: number; count: number }): void {
    this.monitoringApi.generateDemoSensorReadings(request).subscribe({
      next: (readings) => this.mergeReadings(readings),
      error: () => undefined,
    });
  }

  private mergeReadings(readings: SensorReading[]): void {
    if (!readings.length) {
      return;
    }

    this.readingsSignal.update((currentReadings) => {
      const readingsById = new Map(currentReadings.map((reading) => [reading.id, reading]));
      readings.forEach((reading) => readingsById.set(reading.id, reading));
      this.readingsLoadedForOrganizationId = this.organizationScope.activeOrganizationId();
      return [...readingsById.values()].sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
      );
    });
  }

  private initOfflineReadings(readings: SensorReading[]): void {
    if (this.offlineReadings().length > 0) return;
    const sorted = [...readings].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );
    const offline = sorted
      .filter((reading) => reading.temperature !== null && reading.humidity !== null)
      .slice(0, 6)
      .map(
        (reading, index) =>
          new OfflineReading(
            reading.id,
            reading.assetId,
            reading.iotDeviceId,
            reading.temperature ?? 0,
            reading.humidity ?? 0,
            reading.recordedAt,
            index < 3 ? SyncStatus.Pending : index === 3 ? SyncStatus.Failed : SyncStatus.Synced,
          ),
      );
    this.offlineReadingsSignal.set(offline);
  }

  private formatError(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message;
    return fallback;
  }
}

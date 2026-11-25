import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { AssetSettings } from '../../../../asset-management/domain/model/asset-settings.entity';
import { Asset } from '../../../../asset-management/domain/model/asset.entity';
import { AssetType } from '../../../../asset-management/domain/model/asset-type.enum';
import { IoTDevice } from '../../../../asset-management/domain/model/iot-device.entity';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';
import {
  IncrementApi,
  CurrentState,
  StatePage,
} from '../../../../shared/infrastructure/increment-api';
import { SensorReading } from '../../../domain/model/sensor-reading.entity';
import { TemperaturePoint } from '../../../domain/model/temperature-point.entity';
import { MonitoringAssetCard } from '../../components/monitoring-asset-card/monitoring-asset-card';

interface AssetMonitoringTab {
  type: AssetType;
  labelKey: string;
}

interface AssetMonitoringItem {
  asset: Asset;
  device: IoTDevice | null;
  location: string;
  latestReading: SensorReading | null;
  settings: AssetSettings | undefined;
  chartPoints: TemperaturePoint[];
  telemetryState: string;
  safeRange: CurrentState['safeRange'] | undefined;
}

interface TemperatureLimits {
  min: number;
  max: number;
}

/**
 * @summary Presents the asset monitoring dashboard user interface in the monitoring bounded context.
 */
@Component({
  selector: 'app-asset-monitoring-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, MonitoringAssetCard, ListPagination],
  templateUrl: './asset-monitoring-dashboard.html',
  styleUrl: './asset-monitoring-dashboard.css',
})
export class AssetMonitoringDashboard implements OnInit {
  private readonly identityStore = inject(IdentityAccessStore);
  private readonly assetStore = inject(AssetManagementStore);
  private readonly api = inject(IncrementApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly states = signal<CurrentState[]>([]);
  protected readonly stateError = signal(false);
  protected readonly stateLoading = signal(true);
  protected readonly statusFilter = signal('');
  protected readonly locationFilter = signal(0);
  protected readonly locations = computed(() =>
    this.assetStore.locationsForOrganization(this.activeOrganizationId()),
  );
  private readonly observedReadings = signal(new Map<number, SensorReading[]>());

  protected readonly searchTerm = signal('');
  protected readonly pageSize = 10;
  protected readonly currentPage = signal(1);
  protected readonly tabs: AssetMonitoringTab[] = [
    { type: AssetType.ColdRoom, labelKey: 'monitoring.asset-monitoring.tabs.cold-room' },
    { type: AssetType.Transport, labelKey: 'monitoring.asset-monitoring.tabs.transport' },
  ];
  protected readonly activeType = signal<AssetType>(AssetType.ColdRoom);
  protected readonly subtitleKey = computed(() =>
    this.activeType() === AssetType.Transport
      ? 'monitoring.asset-monitoring.transport-subtitle'
      : 'monitoring.asset-monitoring.subtitle',
  );

  protected readonly activeOrganizationId = computed(() => {
    return this.identityStore.currentOrganizationIdFrom(this.identityStore.users());
  });
  protected readonly canMonitorAssets = computed(() => {
    return this.identityStore.canMonitorAssets(
      this.identityStore.users(),
      this.identityStore.roles(),
    );
  });
  protected readonly identityDataReady = computed(() => this.identityStore.roles().length > 0);

  protected readonly filteredItems = computed<AssetMonitoringItem[]>(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const organizationId = this.activeOrganizationId();

    return this.assetStore
      .assetsForOrganization(organizationId)
      .filter((asset) => asset.type === this.activeType())
      .filter((asset) => this.matchesSearch(asset, query))
      .filter((asset) => !this.locationFilter() || asset.locationId === this.locationFilter())
      .map((asset) => this.buildMonitoringItem(asset))
      .filter((item) => !this.statusFilter() || item.telemetryState === this.statusFilter())
      .sort((left, right) => {
        const leftIssue = left.telemetryState === 'NORMAL' ? 0 : 1;
        const rightIssue = right.telemetryState === 'NORMAL' ? 0 : 1;

        return rightIssue - leftIssue || left.asset.name.localeCompare(right.asset.name);
      });
  });
  protected readonly paginatedItems = computed(() =>
    this.paginate(this.filteredItems(), this.currentPage()),
  );

  protected readonly totalAssets = computed(() => this.filteredItems().length);
  protected readonly assetsWithReadings = computed(
    () => this.filteredItems().filter((item) => item.latestReading !== null).length,
  );
  protected readonly assetsOutOfRange = computed(
    () => this.filteredItems().filter((item) => item.telemetryState === 'OUT_OF_RANGE').length,
  );

  /**
   * @summary Initializes the asset monitoring dashboard view state.
   */
  ngOnInit(): void {
    this.identityStore.loadUsers();
    this.identityStore.loadOrganizations();
    this.identityStore.loadRoles();
    this.assetStore.loadAssets({ force: true });
    this.assetStore.loadLocations();
    this.assetStore.loadIoTDevices({ force: true });
    this.assetStore.loadGateways();
    this.assetStore.loadAssetSettings();
    this.loadStates();
    const timer = setInterval(() => this.loadStates(), 10000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected loadStates(): void {
    this.stateLoading.set(true);
    const loadPage = (page: number, collected: CurrentState[]) => {
      this.api.get<StatePage>(`/api/v1/assets/states?page=${page}&size=50`).subscribe({
        next: (result) => {
          const items = [...collected, ...result.items];
          if (items.length < result.total && result.items.length) {
            loadPage(page + 1, items);
            return;
          }
          this.states.set(items);
          const history = new Map(this.observedReadings());
          for (const state of items) {
            if (!state.lastRecordedAt) continue;
            const rows = history.get(state.assetId) ?? [];
            if (rows.some((row) => row.recordedAt === state.lastRecordedAt)) continue;
            const device = this.assetStore
              .iotDevices()
              .find((value) => value.assetId === state.assetId);
            history.set(
              state.assetId,
              [
                new SensorReading(
                  Date.parse(state.lastRecordedAt),
                  state.assetId,
                  device?.id ?? 0,
                  state.lastTemperature ?? null,
                  state.lastHumidity ?? null,
                  state.status === 'OUT_OF_RANGE',
                  state.lastRecordedAt,
                ),
                ...rows,
              ].slice(0, 24),
            );
          }
          this.observedReadings.set(history);
          this.stateError.set(false);
          this.stateLoading.set(false);
        },
        error: () => {
          this.stateError.set(true);
          this.stateLoading.set(false);
        },
      });
    };
    loadPage(0, []);
  }

  protected filterState(value: string): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
  }
  protected filterLocation(value: string): void {
    this.locationFilter.set(Number(value));
    this.currentPage.set(1);
  }

  protected updateSearchTerm(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
    this.currentPage.set(1);
  }

  protected selectAssetType(type: AssetType): void {
    this.activeType.set(type);
    this.currentPage.set(1);
  }

  protected updatePage(page: number): void {
    this.currentPage.set(page);
  }

  private buildMonitoringItem(asset: Asset): AssetMonitoringItem {
    const state = this.states().find((value) => value.assetId === asset.id);
    const readings = this.observedReadings().get(asset.id) ?? [];
    const settings = this.assetStore.settingsForAsset(this.activeOrganizationId(), asset.id);
    const chartReadings = readings
      .filter((reading) => reading.temperature !== null)
      .slice(0, 24)
      .reverse();
    const limits = state
      ? { min: state.safeRange.minTemperature, max: state.safeRange.maxTemperature }
      : this.temperatureLimitsFor(chartReadings, settings);

    return {
      asset,
      device: this.linkedDeviceFor(asset),
      location: this.assetLocationFor(asset),
      latestReading: readings[0] ?? null,
      settings,
      telemetryState: this.stateError() ? 'UNAVAILABLE' : (state?.status ?? 'NO_DATA'),
      safeRange: state?.safeRange,
      chartPoints: chartReadings.map((reading, index) =>
        this.toTemperaturePoint(reading, index, limits),
      ),
    };
  }

  private linkedDeviceFor(asset: Asset): IoTDevice | null {
    return (
      this.assetStore
        .iotDevicesForOrganization(this.activeOrganizationId())
        .find((device) => device.assetId === asset.id) ?? null
    );
  }

  private toTemperaturePoint(
    reading: SensorReading,
    index: number,
    limits: TemperatureLimits,
  ): TemperaturePoint {
    const temperature = reading.temperature ?? 0;

    return new TemperaturePoint({
      id: reading.id || index,
      label: new Date(reading.recordedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      temperature,
      ghost: temperature,
      maxLimit: limits.max,
      minLimit: limits.min,
    });
  }

  private temperatureLimitsFor(
    readings: SensorReading[],
    settings: AssetSettings | undefined,
  ): TemperatureLimits {
    if (settings) {
      return {
        min: settings.minimumTemperature,
        max: settings.maximumTemperature,
      };
    }

    const temperatures = readings
      .map((reading) => reading.temperature)
      .filter(
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

  private matchesSearch(asset: Asset, query: string): boolean {
    if (!query) {
      return true;
    }

    return [asset.name, asset.uuid, this.assetLocationFor(asset), asset.description]
      .join(' ')
      .toLowerCase()
      .includes(query);
  }

  private assetLocationFor(asset: Asset): string {
    return this.assetStore.locationForAsset(asset);
  }

  private paginate<T>(items: T[], page: number): T[] {
    const pageCount = Math.max(Math.ceil(items.length / this.pageSize), 1);
    const currentPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (currentPage - 1) * this.pageSize;

    return items.slice(startIndex, startIndex + this.pageSize);
  }
}

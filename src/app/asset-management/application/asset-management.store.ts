import { computed, Injectable, signal } from '@angular/core';
import { forkJoin, Observable, tap } from 'rxjs';
import { Asset } from '../domain/model/asset.entity';
import { AssetSettings } from '../domain/model/asset-settings.entity';
import { AssetStatus } from '../domain/model/asset-status.enum';
import { ConnectivityStatus } from '../domain/model/connectivity-status.enum';
import { Gateway } from '../domain/model/gateway.entity';
import { GatewayStatus } from '../domain/model/gateway-status.enum';
import { IoTDevice } from '../domain/model/iot-device.entity';
import { IoTDeviceStatus } from '../domain/model/iot-device-status.enum';
import { Location } from '../domain/model/location.entity';
import { AssetManagementApi } from '../infrastructure/asset-management-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';

interface LoadOptions {
  force?: boolean;
}

/**
 * @summary Defines operational metrics derived from assets, devices, and gateways.
 */
export interface AssetOperationalSummary {
  totalAssets: number;
  monitoredAssets: number;
  connectedDevices: number;
  totalDevices: number;
  connectedGateways: number;
  assetsWithIssues: number;
  connectivityIssues: number;
}

/**
 * @summary Manages asset management state and workflows for presentation components.
 */
@Injectable({ providedIn: 'root' })
export class AssetManagementStore {
  private readonly locationsSignal = signal<Location[]>([]);
  private readonly assetsSignal = signal<Asset[]>([]);
  private readonly iotDevicesSignal = signal<IoTDevice[]>([]);
  private readonly gatewaysSignal = signal<Gateway[]>([]);
  private readonly assetSettingsSignal = signal<AssetSettings[]>([]);
  private readonly loadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);
  private locationsLoadedForOrganizationId: number | null = null;
  private locationsRequestInFlightForOrganizationId: number | null = null;
  private assetsLoadedForOrganizationId: number | null = null;
  private assetsRequestInFlightForOrganizationId: number | null = null;
  private iotDevicesLoadedForOrganizationId: number | null = null;
  private iotDevicesRequestInFlightForOrganizationId: number | null = null;
  private gatewaysLoadedForOrganizationId: number | null = null;
  private gatewaysRequestInFlightForOrganizationId: number | null = null;
  private assetSettingsLoadedForOrganizationId: number | null = null;
  private assetSettingsRequestInFlightForOrganizationId: number | null = null;

  readonly locations = this.locationsSignal.asReadonly();
  readonly assets = this.assetsSignal.asReadonly();
  readonly iotDevices = this.iotDevicesSignal.asReadonly();
  readonly gateways = this.gatewaysSignal.asReadonly();
  readonly assetSettings = this.assetSettingsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly assetCount = computed(() => this.assets().length);

  constructor(
    private assetManagementApi: AssetManagementApi,
    private organizationScope: OrganizationScopeStore,
  ) {}

  /**
   * @summary Returns locations scoped to one organization.
   */
  locationsForOrganization(
    organizationId: number | null,
    locations = this.locations(),
  ): Location[] {
    if (!organizationId) {
      return [];
    }

    return locations.filter((location) => location.organizationId === organizationId);
  }

  /**
   * @summary Returns the number of assets with operational issues for one organization.
   */
  assetIssueCountFor(organizationId: number | null): number {
    if (!organizationId) {
      return 0;
    }

    const iotDevices = this.iotDevicesForOrganization(organizationId);
    const gateways = this.gatewaysForOrganization(organizationId);

    return this.assets().filter((asset) => {
      return asset.organizationId === organizationId && this.hasAssetIssue(asset, iotDevices, gateways);
    }).length;
  }

  /**
   * @summary Returns assets scoped to one organization.
   */
  assetsForOrganization(organizationId: number | null, assets = this.assets()): Asset[] {
    if (!organizationId) {
      return [];
    }

    return assets.filter((asset) => asset.organizationId === organizationId);
  }

  /**
   * @summary Returns IoT devices scoped to one organization.
   */
  iotDevicesForOrganization(
    organizationId: number | null,
    iotDevices = this.iotDevices(),
  ): IoTDevice[] {
    if (!organizationId) {
      return [];
    }

    return iotDevices.filter((iotDevice) => iotDevice.organizationId === organizationId);
  }

  /**
   * @summary Returns gateways scoped to one organization.
   */
  gatewaysForOrganization(organizationId: number | null, gateways = this.gateways()): Gateway[] {
    if (!organizationId) {
      return [];
    }

    return gateways.filter((gateway) => gateway.organizationId === organizationId);
  }

  /**
   * @summary Returns asset settings scoped to one organization.
   */
  assetSettingsForOrganization(
    organizationId: number | null,
    assetSettings = this.assetSettings(),
  ): AssetSettings[] {
    if (!organizationId) {
      return [];
    }

    return assetSettings.filter((settings) => settings.organizationId === organizationId);
  }

  /**
   * @summary Returns default settings scoped to one organization.
   */
  defaultSettingsForOrganization(organizationId: number | null): AssetSettings | undefined {
    return this.assetSettingsForOrganization(organizationId).find(
      (assetSettings) => assetSettings.assetId === null,
    );
  }

  /**
   * @summary Resolves an asset location from the location catalog.
   */
  locationForAsset(asset: Asset, locations: Location[] = this.locations()): string {
    return this.locationNameById(asset.locationId, locations);
  }

  /**
   * @summary Resolves a gateway location by identifier.
   */
  locationForGateway(gateway: Gateway, locations: Location[] = this.locations()): string {
    return this.locationNameById(gateway.locationId, locations);
  }

  /**
   * @summary Resolves a readable location name by identifier.
   */
  locationNameById(locationId: number | null, locations: Location[] = this.locations()): string {
    if (!locationId) {
      return 'N/A';
    }

    return locations.find((location) => location.id === locationId)?.name ?? 'N/A';
  }

  /**
   * @summary Finds the gateway connected to an IoT device assigned to an asset.
   */
  gatewayForAsset(
    asset: Asset,
    iotDevices: IoTDevice[] = this.iotDevices(),
    gateways: Gateway[] = this.gateways(),
  ): Gateway | null {
    const assignedGatewayIds = iotDevices
      .filter((device) => device.assetId === asset.id)
      .map((device) => device.gatewayId);

    return (
      gateways.find(
        (gateway) =>
          assignedGatewayIds.includes(gateway.id) && gateway.locationId === asset.locationId,
      ) ?? null
    );
  }

  /**
   * @summary Resolves live asset connectivity from assigned devices and gateways.
   */
  connectivityForAsset(
    asset: Asset,
    iotDevices: IoTDevice[] = this.iotDevices(),
    gateways: Gateway[] = this.gateways(),
  ): ConnectivityStatus {
    const linkedDevices = iotDevices.filter(
      (iotDevice) =>
        iotDevice.assetId === asset.id && iotDevice.status === IoTDeviceStatus.Linked,
    );

    if (!linkedDevices.length) {
      return ConnectivityStatus.Offline;
    }

    const assignedGateways = linkedDevices
      .map((iotDevice) =>
        gateways.find(
          (gateway) =>
            gateway.id === iotDevice.gatewayId && gateway.locationId === asset.locationId,
        ),
      )
      .filter((gateway): gateway is Gateway => !!gateway);

    if (!assignedGateways.length) {
      return ConnectivityStatus.Offline;
    }

    if (assignedGateways.some((gateway) => gateway.status === GatewayStatus.Active)) {
      return ConnectivityStatus.Online;
    }

    if (assignedGateways.some((gateway) => gateway.status === GatewayStatus.Maintenance)) {
      return ConnectivityStatus.Unstable;
    }

    return ConnectivityStatus.Offline;
  }

  /**
   * @summary Returns assets that have at least one monitoring device assigned.
   */
  monitoredAssetsForOrganization(
    organizationId: number | null,
    assets = this.assets(),
    iotDevices = this.iotDevices(),
  ): Asset[] {
    const organizationAssets = this.assetsForOrganization(organizationId, assets);
    const monitoredAssetIds = new Set(
      this.iotDevicesForOrganization(organizationId, iotDevices)
        .filter((iotDevice) => iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId),
    );

    return organizationAssets.filter((asset) => monitoredAssetIds.has(asset.id));
  }

  /**
   * @summary Returns monitoring devices assigned to one asset.
   */
  iotDevicesForAsset(assetId: number | null, iotDevices = this.iotDevices()): IoTDevice[] {
    if (!assetId) {
      return [];
    }

    return iotDevices.filter((iotDevice) => iotDevice.assetId === assetId);
  }

  /**
   * @summary Resolves asset-specific settings with an organization fallback.
   */
  settingsForAsset(
    organizationId: number | null,
    assetId: number | null,
  ): AssetSettings | undefined {
    const settings = this.assetSettingsForOrganization(organizationId);
    const assetSpecificSettings = settings.find(
      (assetSettings) => assetSettings.assetId !== null && assetSettings.assetId === assetId,
    );

    return (
      assetSpecificSettings ??
      settings.find((assetSettings) => assetSettings.assetId === null) ??
      settings[0]
    );
  }

  /**
   * @summary Calculates the next asset settings id value.
   */
  nextAssetSettingsId(): number {
    return Math.max(...this.assetSettings().map((settings) => settings.id), 0) + 1;
  }

  /**
   * @summary Builds the operational summary metrics for one organization.
   */
  operationalSummaryFor(organizationId: number | null): AssetOperationalSummary {
    const assets = this.assetsForOrganization(organizationId);
    const iotDevices = this.iotDevicesForOrganization(organizationId);
    const gateways = this.gatewaysForOrganization(organizationId);
    const monitoredAssetIds = new Set(
      iotDevices
        .filter((iotDevice) => iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId),
    );

    return {
      totalAssets: assets.length,
      monitoredAssets: assets.filter((asset) => monitoredAssetIds.has(asset.id)).length,
      connectedDevices: iotDevices.filter(
        (iotDevice) => iotDevice.status === IoTDeviceStatus.Linked,
      ).length,
      totalDevices: iotDevices.length,
      connectedGateways: gateways.filter((gateway) => gateway.status === GatewayStatus.Active)
        .length,
      assetsWithIssues: assets.filter((asset) => this.hasAssetIssue(asset, iotDevices, gateways))
        .length,
      connectivityIssues: assets.filter(
        (asset) =>
          this.connectivityForAsset(asset, iotDevices, gateways) !== ConnectivityStatus.Online,
      ).length,
    };
  }

  /**
   * @summary Loads assets data into local state.
   */
  loadAssets(options: LoadOptions = {}): void {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.assetsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.assetsLoadedForOrganizationId === organizationId ||
        this.assetsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.assetsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.assetManagementApi.getAssets().subscribe({
      next: (assets) => {
        this.assetsSignal.set(assets);
        this.assetsLoadedForOrganizationId = organizationId;
        this.assetsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.assetsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Loads locations data into local state.
   */
  loadLocations(options: LoadOptions = {}): void {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.locationsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.locationsLoadedForOrganizationId === organizationId ||
        this.locationsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.locationsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.assetManagementApi.getLocations().subscribe({
      next: (locations) => {
        this.locationsSignal.set(locations);
        this.locationsLoadedForOrganizationId = organizationId;
        this.locationsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.locationsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Persists a location and appends it to local state.
   */
  createLocation(location: Location): Observable<Location> {
    return this.assetManagementApi.createLocation(location).pipe(
      tap((createdLocation) => {
        this.locationsSignal.update((locations) => [...locations, createdLocation]);
        this.locationsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists location changes and replaces the local entry.
   */
  updateLocation(location: Location): Observable<Location> {
    return this.assetManagementApi.updateLocation(location).pipe(
      tap((updatedLocation) => {
        this.locationsSignal.update((locations) =>
          locations.map((currentLocation) =>
            currentLocation.id === updatedLocation.id ? updatedLocation : currentLocation,
          ),
        );
        this.locationsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists an asset and appends it to local state.
   */
  createAsset(asset: Asset): Observable<Asset> {
    return this.assetManagementApi.createAsset(asset).pipe(
      tap((createdAsset) => {
        this.assetsSignal.update((assets) => [...assets, createdAsset]);
        this.assetsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists asset changes and replaces the local entry.
   */
  updateAsset(asset: Asset): Observable<Asset> {
    return this.assetManagementApi.updateAsset(asset).pipe(
      tap((updatedAsset) => {
        this.assetsSignal.update((assets) =>
          assets.map((currentAsset) =>
            currentAsset.id === updatedAsset.id ? updatedAsset : currentAsset,
          ),
        );
        this.assetsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Loads IoT devices data into local state.
   */
  loadIoTDevices(options: LoadOptions = {}): void {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.iotDevicesSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.iotDevicesLoadedForOrganizationId === organizationId ||
        this.iotDevicesRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.iotDevicesRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.assetManagementApi.getIoTDevices().subscribe({
      next: (iotDevices) => {
        this.iotDevicesSignal.set(iotDevices);
        this.iotDevicesLoadedForOrganizationId = organizationId;
        this.iotDevicesRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.iotDevicesRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Persists an IoT device and appends it to local state.
   */
  createIoTDevice(iotDevice: IoTDevice): Observable<IoTDevice> {
    return this.assetManagementApi.createIoTDevice(iotDevice).pipe(
      tap((createdIoTDevice) => {
        this.iotDevicesSignal.update((iotDevices) => [...iotDevices, createdIoTDevice]);
        this.iotDevicesLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists IoT device changes and replaces the local entry.
   */
  updateIoTDevice(iotDevice: IoTDevice): Observable<IoTDevice> {
    return this.assetManagementApi.updateIoTDevice(iotDevice).pipe(
      tap((updatedIoTDevice) => {
        this.iotDevicesSignal.update((iotDevices) =>
          iotDevices.map((currentIoTDevice) =>
            currentIoTDevice.id === updatedIoTDevice.id ? updatedIoTDevice : currentIoTDevice,
          ),
        );
        this.iotDevicesLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Loads gateways data into local state.
   */
  loadGateways(options: LoadOptions = {}): void {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.gatewaysSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.gatewaysLoadedForOrganizationId === organizationId ||
        this.gatewaysRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.gatewaysRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.assetManagementApi.getGateways().subscribe({
      next: (gateways) => {
        this.gatewaysSignal.set(gateways);
        this.gatewaysLoadedForOrganizationId = organizationId;
        this.gatewaysRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.gatewaysRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Persists a gateway and appends it to local state.
   */
  createGateway(gateway: Gateway): Observable<Gateway> {
    return this.assetManagementApi.createGateway(gateway).pipe(
      tap((createdGateway) => {
        this.gatewaysSignal.update((gateways) => [...gateways, createdGateway]);
        this.gatewaysLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists gateway changes and replaces the local entry.
   */
  updateGateway(gateway: Gateway): Observable<Gateway> {
    return this.assetManagementApi.updateGateway(gateway).pipe(
      tap((updatedGateway) => {
        this.gatewaysSignal.update((gateways) =>
          gateways.map((currentGateway) =>
            currentGateway.id === updatedGateway.id ? updatedGateway : currentGateway,
          ),
        );
        this.gatewaysLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Loads asset settings data into local state.
   */
  loadAssetSettings(options: LoadOptions = {}): void {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.assetSettingsSignal.set([]);
      return;
    }

    if (
      !options.force &&
      (this.assetSettingsLoadedForOrganizationId === organizationId ||
        this.assetSettingsRequestInFlightForOrganizationId === organizationId)
    ) {
      return;
    }

    this.assetSettingsRequestInFlightForOrganizationId = organizationId;
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.assetManagementApi.getAssetSettings().subscribe({
      next: (assetSettings) => {
        this.assetSettingsSignal.set(assetSettings);
        this.assetSettingsLoadedForOrganizationId = organizationId;
        this.assetSettingsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
      error: (error) => {
        this.errorSignal.set(error.message);
        this.assetSettingsRequestInFlightForOrganizationId = null;
        this.loadingSignal.set(false);
      },
    });
  }

  /**
   * @summary Persists asset settings and appends them to local state.
   */
  createAssetSettings(assetSettings: AssetSettings): Observable<AssetSettings> {
    return this.assetManagementApi.createAssetSettings(assetSettings).pipe(
      tap((createdAssetSettings) => {
        this.assetSettingsSignal.update((settings) => [...settings, createdAssetSettings]);
        this.assetSettingsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Persists asset settings changes and replaces the local entry.
   */
  updateAssetSettings(assetSettings: AssetSettings): Observable<AssetSettings> {
    return this.assetManagementApi.updateAssetSettings(assetSettings).pipe(
      tap((updatedAssetSettings) => {
        this.assetSettingsSignal.update((settings) =>
          settings.map((currentSettings) =>
            currentSettings.id === updatedAssetSettings.id ? updatedAssetSettings : currentSettings,
          ),
        );
        this.assetSettingsLoadedForOrganizationId = this.activeOrganizationId();
      }),
    );
  }

  /**
   * @summary Refreshes organization operational state from the backend.
   */
  updateOrganizationTelemetry(organizationId: number | null): void {
    if (!organizationId) {
      return;
    }

    forkJoin({
      assets: this.assetManagementApi.getAssets(),
      iotDevices: this.assetManagementApi.getIoTDevices(),
      gateways: this.assetManagementApi.getGateways(),
      locations: this.assetManagementApi.getLocations(),
      assetSettings: this.assetManagementApi.getAssetSettings(),
    }).subscribe({
      next: ({ assets, iotDevices, gateways, locations, assetSettings }) => {
        this.assetsSignal.set(assets);
        this.iotDevicesSignal.set(iotDevices);
        this.gatewaysSignal.set(gateways);
        this.locationsSignal.set(locations);
        this.assetSettingsSignal.set(assetSettings);
        this.assetsLoadedForOrganizationId = organizationId;
        this.iotDevicesLoadedForOrganizationId = organizationId;
        this.gatewaysLoadedForOrganizationId = organizationId;
        this.locationsLoadedForOrganizationId = organizationId;
        this.assetSettingsLoadedForOrganizationId = organizationId;
      },
      error: () => undefined,
    });
  }

  private activeOrganizationId(): number | null {
    return this.organizationScope.activeOrganizationId();
  }

  private hasAssetIssue(
    asset: Asset,
    iotDevices: IoTDevice[] = this.iotDevices(),
    gateways: Gateway[] = this.gateways(),
  ): boolean {
    return (
      asset.lastIncident !== 'none' ||
      this.connectivityForAsset(asset, iotDevices, gateways) !== ConnectivityStatus.Online ||
      asset.status !== AssetStatus.Active
    );
  }

}

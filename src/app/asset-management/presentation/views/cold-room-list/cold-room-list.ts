import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { AssetManagementStore } from '../../../application/asset-management.store';
import { Asset } from '../../../domain/model/asset.entity';
import { AssetStatus } from '../../../domain/model/asset-status.enum';
import { AssetType } from '../../../domain/model/asset-type.enum';
import { CalibrationStatus } from '../../../domain/model/calibration-status.enum';
import { ConnectivityStatus } from '../../../domain/model/connectivity-status.enum';
import { Gateway } from '../../../domain/model/gateway.entity';
import { GatewayStatus } from '../../../domain/model/gateway-status.enum';
import { IoTDevice } from '../../../domain/model/iot-device.entity';
import { IoTDeviceStatus } from '../../../domain/model/iot-device-status.enum';
import { Location } from '../../../domain/model/location.entity';
import {
  IOT_DEVICE_DEFINITIONS,
  IoTDeviceDefinition,
  IoTMeasurementParameter,
} from '../../../domain/model/iot-device-definitions';
import { Organization } from '../../../../identity-access/domain/model/organization.entity';
import { Role } from '../../../../identity-access/domain/model/role.entity';
import { User } from '../../../../identity-access/domain/model/user.entity';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { IdentityAccessApi } from '../../../../identity-access/infrastructure/identity-access-api';
import { ListPagination } from '../../../../shared/presentation/components/list-pagination/list-pagination';

type AssetFeedback =
  | 'idle'
  | 'success'
  | 'updated'
  | 'asset-updated'
  | 'duplicate-id'
  | 'server-error'
  | 'iot-device-created'
  | 'iot-device-updated'
  | 'gateway-created'
  | 'gateway-updated'
  | 'location-created'
  | 'location-updated';
type AssetManagementTab = AssetType | 'location' | 'iot-device' | 'gateway';

/**
 * @summary Presents the cold room list user interface in the asset management bounded context.
 */
@Component({
  selector: 'app-cold-room-list',
  imports: [
    MatButton,
    MatIcon,
    MatProgressSpinner,
    FormsModule,
    NgClass,
    ReactiveFormsModule,
    TranslatePipe,
    ListPagination,
  ],
  templateUrl: './cold-room-list.html',
  styleUrl: './cold-room-list.css',
})
export class ColdRoomList implements OnInit {
  protected readonly assetStatus = AssetStatus;
  protected readonly iotDeviceStatus = IoTDeviceStatus;
  protected readonly calibrationStatus = CalibrationStatus;
  protected readonly gatewayStatus = GatewayStatus;
  protected readonly connectivityStatus = ConnectivityStatus;
  protected readonly assetManagementStore = inject(AssetManagementStore);
  protected readonly identityAccessStore = inject(IdentityAccessStore);
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);
  private readonly identityAccessApi = inject(IdentityAccessApi);
  private readonly router = inject(Router);

  protected readonly assetTypeTabs: AssetManagementTab[] = [
    AssetType.ColdRoom,
    AssetType.Transport,
    'location',
    'gateway',
    'iot-device',
  ];
  protected readonly assetStatuses: AssetStatus[] = [
    AssetStatus.Active,
    AssetStatus.Maintenance,
    AssetStatus.Inactive,
  ];
  protected readonly iotDeviceDefinitions: IoTDeviceDefinition[] = IOT_DEVICE_DEFINITIONS;
  protected readonly iotDeviceTypes = this.iotDeviceDefinitions.map(
    (definition) => definition.type,
  );
  protected readonly gatewayStatuses: GatewayStatus[] = [
    GatewayStatus.Active,
    GatewayStatus.Maintenance,
    GatewayStatus.Offline,
  ];
  protected readonly iotDeviceStatuses: IoTDeviceStatus[] = [
    IoTDeviceStatus.Linked,
    IoTDeviceStatus.Available,
    IoTDeviceStatus.Offline,
  ];
  protected readonly calibrationStatuses: CalibrationStatus[] = [
    CalibrationStatus.Compliant,
    CalibrationStatus.DueSoon,
    CalibrationStatus.Expired,
    CalibrationStatus.Unknown,
  ];
  protected readonly locationTypes = [
    'WAREHOUSE',
    'CLIENT_SITE',
    'ROUTE',
    'LABORATORY',
    'DISTRIBUTION_CENTER',
  ];
  protected readonly locationStatuses = ['active', 'maintenance', 'inactive'];
  private readonly locationTypeFormAliases: Record<string, string> = {
    facility: 'WAREHOUSE',
    'transport-route': 'ROUTE',
  };
  protected readonly identityLoading = signal(false);
  protected readonly creating = signal(false);
  protected readonly updatingAssetId = signal<number | null>(null);
  protected readonly editingAssetId = signal<number | null>(null);
  protected readonly editingIoTDeviceId = signal<number | null>(null);
  protected readonly editingGatewayId = signal<number | null>(null);
  protected readonly editingLocationId = signal<number | null>(null);
  protected readonly pendingAssetStatuses = signal<Record<number, AssetStatus>>({});
  protected readonly submitted = signal(false);
  protected readonly formVisible = signal(false);
  protected readonly feedback = signal<AssetFeedback>('idle');
  protected readonly searchTerm = signal('');
  protected readonly pageSize = 10;
  protected readonly assetPage = signal(1);
  protected readonly iotDevicePage = signal(1);
  protected readonly gatewayPage = signal(1);
  protected readonly locationPage = signal(1);
  protected readonly selectedTab = signal<AssetManagementTab>(AssetType.ColdRoom);
  protected readonly users = signal<User[]>([]);
  protected readonly roles = signal<Role[]>([]);
  protected readonly organizations = signal<Organization[]>([]);

  protected readonly coldRoomForm = this.fb.nonNullable.group({
    internalId: ['', [Validators.required, Validators.minLength(3)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    locationId: [0, [Validators.required, Validators.min(1)]],
    capacity: [0, [Validators.required, Validators.min(1)]],
    description: [''],
    status: [AssetStatus.Active, [Validators.required]],
  });

  protected readonly iotDeviceForm = this.fb.nonNullable.group({
    internalId: ['', [Validators.required, Validators.minLength(3)]],
    gatewayId: [0, [Validators.required, Validators.min(1)]],
    deviceType: ['', [Validators.required]],
    model: ['', [Validators.required, Validators.minLength(3)]],
    measurementType: ['', [Validators.required]],
    assetId: [0],
    status: [IoTDeviceStatus.Available, [Validators.required]],
    calibrationStatus: [CalibrationStatus.Unknown, [Validators.required]],
    lastCalibrationDate: [''],
    nextCalibrationDate: [''],
    readingFrequencyMinutes: [60, [Validators.required, Validators.min(5), Validators.max(1440)]],
  });

  protected readonly gatewayForm = this.fb.nonNullable.group({
    internalId: ['', [Validators.required, Validators.minLength(3)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    locationId: [0, [Validators.required, Validators.min(1)]],
    network: ['', [Validators.required, Validators.minLength(2)]],
    status: [GatewayStatus.Active, [Validators.required]],
  });

  protected readonly locationForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['WAREHOUSE', [Validators.required]],
    address: [''],
    description: [''],
    status: ['active', [Validators.required]],
  });

  protected readonly loading = computed(
    () => this.identityLoading() || this.assetManagementStore.loading(),
  );
  protected readonly assets = this.assetManagementStore.assets;
  protected readonly iotDevices = this.assetManagementStore.iotDevices;
  protected readonly gateways = this.assetManagementStore.gateways;
  protected readonly locations = this.assetManagementStore.locations;
  protected readonly activeOrganizationName = computed(() => {
    return this.identityAccessStore.currentOrganizationNameFrom(this.users(), this.organizations());
  });
  protected readonly profileUserName = computed(() =>
    this.identityAccessStore.currentUserNameFrom(this.users()),
  );
  protected readonly profileRoleLabelKey = computed(() =>
    this.identityAccessStore.currentRoleLabelKeyFrom(this.users(), this.roles()),
  );
  protected readonly canManageAccess = computed(() =>
    this.identityAccessStore.canManageAccess(this.users(), this.roles()),
  );
  protected readonly canManageAssets = computed(() =>
    this.identityAccessStore.canManageAssets(this.users(), this.roles()),
  );
  protected readonly selectedAssetType = computed(() => {
    return this.selectedTab() === AssetType.Transport ? AssetType.Transport : AssetType.ColdRoom;
  });
  protected readonly isAssetTab = computed(() => {
    return this.selectedTab() === AssetType.ColdRoom || this.selectedTab() === AssetType.Transport;
  });
  protected readonly canCreateSelectedResource = computed(() => {
    return (
      this.isAssetTab() ||
      this.selectedTab() === 'location' ||
      this.selectedTab() === 'iot-device' ||
      this.selectedTab() === 'gateway'
    );
  });
  protected readonly positiveFeedback = computed(() => {
    return [
      'success',
      'updated',
      'asset-updated',
      'iot-device-created',
      'iot-device-updated',
      'gateway-created',
      'gateway-updated',
      'location-created',
      'location-updated',
    ].includes(this.feedback());
  });

  protected readonly selectedAssets = computed(() => {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return [];
    }

    return this.assets().filter((asset) => {
      return asset.organizationId === organizationId && asset.type === this.selectedAssetType();
    });
  });

  protected readonly organizationAssets = computed(() => {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return [];
    }

    return this.assets().filter((asset) => asset.organizationId === organizationId);
  });

  protected readonly assetIssueCount = computed(() => {
    return this.assetManagementStore.assetIssueCountFor(this.activeOrganizationId());
  });

  protected readonly organizationIoTDevices = computed(() => {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return [];
    }

    return this.iotDevices().filter((iotDevice) => iotDevice.organizationId === organizationId);
  });

  protected readonly organizationGateways = computed(() => {
    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      return [];
    }

    return this.gateways().filter((gateway) => gateway.organizationId === organizationId);
  });

  protected readonly organizationLocations = computed(() => {
    return this.assetManagementStore.locationsForOrganization(
      this.activeOrganizationId(),
      this.locations(),
    );
  });

  protected readonly filteredLocations = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();

    if (!normalizedSearch) {
      return this.organizationLocations();
    }

    return this.organizationLocations().filter((location) =>
      [
        location.name,
        location.type,
        location.address,
        location.description,
        location.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    );
  });

  protected readonly calibrationSummary = computed(() => {
    return [
      {
        status: CalibrationStatus.Compliant,
        count: this.calibrationCount(CalibrationStatus.Compliant),
      },
      {
        status: CalibrationStatus.DueSoon,
        count: this.calibrationCount(CalibrationStatus.DueSoon),
      },
      {
        status: CalibrationStatus.Expired,
        count: this.calibrationCount(CalibrationStatus.Expired),
      },
      {
        status: CalibrationStatus.Unknown,
        count: this.calibrationCount(CalibrationStatus.Unknown),
      },
    ];
  });

  protected readonly filteredAssets = computed(() => {
    const normalizedSearch = this.searchTerm().trim().toLowerCase();

    if (!normalizedSearch) {
      return this.selectedAssets();
    }

    return this.selectedAssets().filter((asset) => {
      return [
        asset.uuid,
        asset.name,
        this.assetLocationFor(asset),
        asset.status,
        this.displayedConnectivity(asset),
        asset.lastIncident,
        this.gatewayNameForAsset(asset),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  });

  protected readonly paginatedAssets = computed(() =>
    this.paginate(this.filteredAssets(), this.assetPage()),
  );
  protected readonly paginatedIoTDevices = computed(() =>
    this.paginate(this.organizationIoTDevices(), this.iotDevicePage()),
  );
  protected readonly paginatedGateways = computed(() =>
    this.paginate(this.organizationGateways(), this.gatewayPage()),
  );
  protected readonly paginatedLocations = computed(() =>
    this.paginate(this.filteredLocations(), this.locationPage()),
  );

  /**
   * @summary Initializes the cold room list view state.
   */
  ngOnInit(): void {
    this.loadPageData();
  }

  protected loadPageData(): void {
    this.identityLoading.set(true);
    this.feedback.set('idle');
    this.assetManagementStore.loadAssets();
    this.assetManagementStore.loadIoTDevices();
    this.assetManagementStore.loadGateways();
    this.assetManagementStore.loadLocations();
    this.assetManagementStore.loadAssetSettings();

    forkJoin({
      users: this.identityAccessApi.getUsers(),
      roles: this.identityAccessApi.getRoles(),
      organizations: this.identityAccessApi.getOrganizations(),
    })
      .pipe(finalize(() => this.identityLoading.set(false)))
      .subscribe({
        next: ({ users, roles, organizations }) => {
          this.users.set(users);
          this.roles.set(roles);
          this.organizations.set(organizations);
          this.identityAccessStore.setCurrentContextFrom(users, roles, organizations);
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.assetPage.set(1);
    this.locationPage.set(1);
  }

  protected selectAssetType(tab: AssetManagementTab): void {
    if (this.selectedTab() === tab) {
      return;
    }

    this.selectedTab.set(tab);
    this.searchTerm.set('');
    this.assetPage.set(1);
    this.iotDevicePage.set(1);
    this.gatewayPage.set(1);
    this.locationPage.set(1);
    this.formVisible.set(false);
    this.feedback.set('idle');
    this.submitted.set(false);
    this.editingAssetId.set(null);
    this.editingIoTDeviceId.set(null);
    this.editingGatewayId.set(null);
    this.editingLocationId.set(null);
    this.resetForms();
  }

  protected toggleForm(): void {
    this.feedback.set('idle');
    this.submitted.set(false);
    const willOpen = !this.formVisible();
    this.formVisible.set(willOpen);
    this.editingAssetId.set(null);
    this.editingIoTDeviceId.set(null);
    this.editingGatewayId.set(null);
    this.editingLocationId.set(null);
    this.resetForms();
  }

  protected submit(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.coldRoomForm.markAllAsTouched();

    if (this.coldRoomForm.invalid || !this.canManageAssets()) {
      return;
    }

    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.feedback.set('server-error');
      return;
    }

    const editingId = this.editingAssetId();
    const locationId = Number(this.coldRoomForm.controls.locationId.value);
    const location = this.organizationLocations().find(
      (currentLocation) => currentLocation.id === locationId,
    );

    if (!location) {
      this.feedback.set('server-error');
      return;
    }

    const internalId = this.coldRoomForm.controls.internalId.value.trim().toUpperCase();
    const duplicatedInternalId = this.organizationAssets().some((asset) => {
      return asset.id !== editingId && asset.uuid.toLowerCase() === internalId.toLowerCase();
    });

    if (duplicatedInternalId) {
      this.feedback.set('duplicate-id');
      return;
    }

    const currentAsset = editingId
      ? this.organizationAssets().find((asset) => asset.id === editingId)
      : null;

    if (editingId && !currentAsset) {
      this.feedback.set('server-error');
      return;
    }

    const nextStatus = this.coldRoomForm.controls.status.value;
    const nextId = Math.max(...this.assets().map((asset) => asset.id), 0) + 1;
    const asset = new Asset(
      editingId ?? nextId,
      organizationId,
      internalId,
      this.selectedAssetType(),
      location.id,
      this.coldRoomForm.controls.name.value.trim(),
      Number(this.coldRoomForm.controls.capacity.value),
      this.coldRoomForm.controls.description.value.trim(),
      nextStatus,
      currentAsset?.lastIncident ?? 'none',
      currentAsset?.currentTemperature ?? '—',
      currentAsset?.entryDate ?? this.entryDate(),
      currentAsset?.connectivity ?? ConnectivityStatus.Online,
    );
    const request = editingId
      ? this.assetManagementStore.updateAsset(asset)
      : this.assetManagementStore.createAsset(asset);

    this.creating.set(true);
    request.pipe(finalize(() => this.creating.set(false))).subscribe({
      next: () => {
        this.feedback.set(editingId ? 'asset-updated' : 'success');
        this.submitted.set(false);
        this.formVisible.set(false);
        this.editingAssetId.set(null);
        this.resetForm();
      },
      error: () => this.feedback.set('server-error'),
    });
  }

  protected submitIoTDevice(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.iotDeviceForm.markAllAsTouched();

    if (this.iotDeviceForm.invalid || !this.canManageAssets()) {
      return;
    }

    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.feedback.set('server-error');
      return;
    }

    const editingId = this.editingIoTDeviceId();
    const internalId = this.iotDeviceForm.controls.internalId.value.trim().toUpperCase();
    const duplicatedInternalId = this.organizationIoTDevices().some((iotDevice) => {
      return iotDevice.id !== editingId && iotDevice.uuid.toLowerCase() === internalId.toLowerCase();
    });

    if (duplicatedInternalId) {
      this.feedback.set('duplicate-id');
      return;
    }

    const assetId = Number(this.iotDeviceForm.controls.assetId.value) || null;
    const gatewayId = Number(this.iotDeviceForm.controls.gatewayId.value);
    const gateway = this.organizationGateways().find(
      (currentGateway) => currentGateway.id === gatewayId,
    );
    const status = assetId
      ? this.iotDeviceForm.controls.status.value
      : this.iotDeviceForm.controls.status.value === IoTDeviceStatus.Linked
        ? IoTDeviceStatus.Available
        : this.iotDeviceForm.controls.status.value;
    const lastCalibrationDate = this.iotDeviceForm.controls.lastCalibrationDate.value.trim();
    const nextCalibrationDate = this.iotDeviceForm.controls.nextCalibrationDate.value.trim();
    const readingFrequencySeconds =
      Number(this.iotDeviceForm.controls.readingFrequencyMinutes.value) * 60;
    const measurementParameters = this.measurementParametersForDeviceType(
      this.iotDeviceForm.controls.deviceType.value,
    );

    if (!gateway) {
      this.feedback.set('server-error');
      return;
    }

    const iotDevice = new IoTDevice(
      editingId ?? Math.max(...this.iotDevices().map((currentIoTDevice) => currentIoTDevice.id), 0) + 1,
      organizationId,
      gateway.id,
      internalId,
      this.iotDeviceForm.controls.deviceType.value,
      this.iotDeviceForm.controls.model.value.trim(),
      this.measurementTypeLabel(measurementParameters),
      assetId,
      status,
      this.iotDeviceForm.controls.calibrationStatus.value,
      lastCalibrationDate || '—',
      nextCalibrationDate || '—',
      measurementParameters,
      readingFrequencySeconds,
    );
    const request = editingId
      ? this.assetManagementStore.updateIoTDevice(iotDevice)
      : this.assetManagementStore.createIoTDevice(iotDevice);

    this.creating.set(true);
    request.pipe(finalize(() => this.creating.set(false))).subscribe({
      next: () => {
        this.feedback.set(editingId ? 'iot-device-updated' : 'iot-device-created');
        this.submitted.set(false);
        this.formVisible.set(false);
        this.editingIoTDeviceId.set(null);
        this.resetIoTDeviceForm();
      },
      error: () => this.feedback.set('server-error'),
    });
  }

  protected submitGateway(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.gatewayForm.markAllAsTouched();

    if (this.gatewayForm.invalid || !this.canManageAssets()) {
      return;
    }

    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.feedback.set('server-error');
      return;
    }

    const editingId = this.editingGatewayId();
    const internalId = this.gatewayForm.controls.internalId.value.trim().toUpperCase();
    const duplicatedInternalId = this.organizationGateways().some((gateway) => {
      return gateway.id !== editingId && gateway.uuid.toLowerCase() === internalId.toLowerCase();
    });

    if (duplicatedInternalId) {
      this.feedback.set('duplicate-id');
      return;
    }

    const locationId = Number(this.gatewayForm.controls.locationId.value);
    const location = this.organizationLocations().find(
      (currentLocation) => currentLocation.id === locationId,
    );

    if (!location) {
      this.feedback.set('server-error');
      return;
    }

    const gateway = new Gateway(
      editingId ?? Math.max(...this.gateways().map((currentGateway) => currentGateway.id), 0) + 1,
      organizationId,
      location.id,
      internalId,
      this.gatewayForm.controls.name.value.trim(),
      this.gatewayForm.controls.network.value.trim(),
      this.gatewayForm.controls.status.value,
    );
    const request = editingId
      ? this.assetManagementStore.updateGateway(gateway)
      : this.assetManagementStore.createGateway(gateway);

    this.creating.set(true);
    request.pipe(finalize(() => this.creating.set(false))).subscribe({
      next: () => {
        this.feedback.set(editingId ? 'gateway-updated' : 'gateway-created');
        this.submitted.set(false);
        this.formVisible.set(false);
        this.editingGatewayId.set(null);
        this.resetGatewayForm();
      },
      error: () => this.feedback.set('server-error'),
    });
  }

  protected submitLocation(): void {
    this.submitted.set(true);
    this.feedback.set('idle');
    this.locationForm.markAllAsTouched();

    if (this.locationForm.invalid || !this.canManageAssets()) {
      return;
    }

    const organizationId = this.activeOrganizationId();

    if (!organizationId) {
      this.feedback.set('server-error');
      return;
    }

    const editingId = this.editingLocationId();
    const name = this.locationForm.controls.name.value.trim();
    const duplicatedName = this.organizationLocations().some((location) => {
      return location.id !== editingId && location.name.toLowerCase() === name.toLowerCase();
    });

    if (duplicatedName) {
      this.feedback.set('duplicate-id');
      return;
    }

    const location = new Location(
      editingId ?? this.nextLocationId(),
      organizationId,
      name,
      this.locationForm.controls.type.value,
      this.locationForm.controls.address.value.trim(),
      this.locationForm.controls.description.value.trim(),
      this.locationForm.controls.status.value,
    );
    const request = editingId
      ? this.assetManagementStore.updateLocation(location)
      : this.assetManagementStore.createLocation(location);

    this.creating.set(true);
    request.pipe(finalize(() => this.creating.set(false))).subscribe({
      next: () => {
        this.feedback.set(editingId ? 'location-updated' : 'location-created');
        this.submitted.set(false);
        this.formVisible.set(false);
        this.editingLocationId.set(null);
        this.resetLocationForm();
      },
      error: () => this.feedback.set('server-error'),
    });
  }

  protected editLocation(location: Location): void {
    if (!this.canManageAssets()) {
      return;
    }

    this.feedback.set('idle');
    this.submitted.set(false);
    this.editingAssetId.set(null);
    this.editingIoTDeviceId.set(null);
    this.editingGatewayId.set(null);
    this.editingLocationId.set(location.id);
    this.locationForm.reset({
      name: location.name,
      type: this.locationTypeFormValue(location.type),
      address: location.address,
      description: location.description,
      status: location.status,
    });
    this.formVisible.set(true);
  }

  protected editAsset(asset: Asset): void {
    if (!this.canManageAssets()) {
      return;
    }

    this.selectedTab.set(asset.type);
    this.feedback.set('idle');
    this.submitted.set(false);
    this.editingAssetId.set(asset.id);
    this.editingIoTDeviceId.set(null);
    this.editingGatewayId.set(null);
    this.editingLocationId.set(null);
    this.coldRoomForm.reset({
      internalId: asset.uuid,
      name: asset.name,
      locationId: asset.locationId,
      capacity: asset.capacity,
      description: asset.description,
      status: asset.status,
    });
    this.formVisible.set(true);
  }

  protected editIoTDevice(iotDevice: IoTDevice): void {
    if (!this.canManageAssets()) {
      return;
    }

    this.selectedTab.set('iot-device');
    this.feedback.set('idle');
    this.submitted.set(false);
    this.editingAssetId.set(null);
    this.editingIoTDeviceId.set(iotDevice.id);
    this.editingGatewayId.set(null);
    this.editingLocationId.set(null);
    this.iotDeviceForm.reset({
      internalId: iotDevice.uuid,
      gatewayId: iotDevice.gatewayId,
      deviceType: iotDevice.deviceType,
      model: iotDevice.model,
      measurementType: this.measurementTypeLabel(this.measurementParametersFor(iotDevice)),
      assetId: iotDevice.assetId ?? 0,
      status: iotDevice.status,
      calibrationStatus: iotDevice.calibrationStatus,
      lastCalibrationDate: this.blankIfPlaceholder(iotDevice.lastCalibrationDate),
      nextCalibrationDate: this.blankIfPlaceholder(iotDevice.nextCalibrationDate),
      readingFrequencyMinutes: Math.max(5, Math.round(iotDevice.readingFrequencySeconds / 60)),
    });
    this.formVisible.set(true);
  }

  protected editGateway(gateway: Gateway): void {
    if (!this.canManageAssets()) {
      return;
    }

    this.selectedTab.set('gateway');
    this.feedback.set('idle');
    this.submitted.set(false);
    this.editingAssetId.set(null);
    this.editingIoTDeviceId.set(null);
    this.editingGatewayId.set(gateway.id);
    this.editingLocationId.set(null);
    this.gatewayForm.reset({
      internalId: gateway.uuid,
      name: gateway.name,
      locationId: gateway.locationId,
      network: gateway.network,
      status: gateway.status,
    });
    this.formVisible.set(true);
  }

  protected updateAssetStatus(asset: Asset, value: string): void {
    this.feedback.set('idle');

    const nextStatus = this.assetStatuses.find((status) => status === value);

    if (!nextStatus || nextStatus === asset.status || !this.canManageAssets()) {
      this.clearPendingAssetStatus(asset.id);
      return;
    }

    this.pendingAssetStatuses.update((statuses) => ({ ...statuses, [asset.id]: nextStatus }));
    this.updatingAssetId.set(asset.id);
    this.assetManagementStore
      .updateAsset(this.nextAsset(asset, { status: nextStatus }))
      .pipe(
        finalize(() => {
          this.updatingAssetId.set(null);
          this.clearPendingAssetStatus(asset.id);
        }),
      )
      .subscribe({
        next: () => {
          this.feedback.set('updated');
        },
        error: () => this.feedback.set('server-error'),
      });
  }

  protected assetNameForIoTDevice(iotDevice: IoTDevice): string {
    const asset = this.assets().find((currentAsset) => currentAsset.id === iotDevice.assetId);
    return asset ? `${asset.uuid} - ${asset.name}` : 'asset-management.iot-devices.unassigned';
  }

  protected displayedAssetStatus(asset: Asset): AssetStatus {
    return this.pendingAssetStatuses()[asset.id] ?? asset.status;
  }

  protected gatewayNameForAsset(asset: Asset): string {
    const gateway = this.assetManagementStore.gatewayForAsset(
      asset,
      this.organizationIoTDevices(),
      this.organizationGateways(),
    );

    return gateway ? this.gatewayDisplayName(gateway) : 'asset-management.gateways.unassigned';
  }

  protected gatewayNameForIoTDevice(iotDevice: IoTDevice): string {
    return this.gatewayNameById(iotDevice.gatewayId);
  }

  protected gatewayAssetCount(gateway: Gateway): number {
    const assetIds = new Set(
      this.organizationIoTDevices()
        .filter((iotDevice) => iotDevice.gatewayId === gateway.id && iotDevice.assetId !== null)
        .map((iotDevice) => iotDevice.assetId),
    );

    return this.organizationAssets().filter((asset) => assetIds.has(asset.id)).length;
  }

  protected gatewayDeviceCount(gateway: Gateway): number {
    return this.organizationIoTDevices().filter((iotDevice) => iotDevice.gatewayId === gateway.id)
      .length;
  }

  protected assetTypeLabelKey(assetType: AssetManagementTab): string {
    return `asset-management.tabs.${assetType}`;
  }

  protected pageTitleKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.title`;
  }

  protected pageSubtitleKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.subtitle`;
  }

  protected formTitleKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.form-title`;
  }

  protected formSubtitleKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.form-subtitle`;
  }

  protected formOpenKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.form-open`;
  }

  protected formCreateKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.form-create`;
  }

  protected createButtonKey(): string {
    if (this.formVisible()) {
      return 'asset-management.form.close';
    }

    if (this.selectedTab() === 'iot-device') {
      return 'asset-management.iot-devices.form-open';
    }

    if (this.selectedTab() === 'location') {
      return 'asset-management.locations.form-open';
    }

    if (this.selectedTab() === 'gateway') {
      return 'asset-management.gateways.form-open';
    }

    return this.formOpenKey();
  }

  protected formCreatedKey(): string {
    if (this.feedback() === 'updated') {
      return 'asset-management.update.feedback-updated';
    }

    if (this.feedback() === 'asset-updated') {
      return `asset-management.sections.${this.selectedAssetType()}.feedback-updated`;
    }

    if (this.feedback() === 'iot-device-created') {
      return 'asset-management.iot-devices.feedback-created';
    }

    if (this.feedback() === 'iot-device-updated') {
      return 'asset-management.iot-devices.feedback-updated';
    }

    if (this.feedback() === 'gateway-created') {
      return 'asset-management.gateways.feedback-created';
    }

    if (this.feedback() === 'gateway-updated') {
      return 'asset-management.gateways.feedback-updated';
    }

    if (this.feedback() === 'location-created') {
      return 'asset-management.locations.feedback-created';
    }

    if (this.feedback() === 'location-updated') {
      return 'asset-management.locations.feedback-updated';
    }

    return `asset-management.sections.${this.selectedAssetType()}.feedback-created`;
  }

  protected formDuplicateKey(): string {
    if (this.selectedTab() === 'iot-device') {
      return 'asset-management.iot-devices.feedback-duplicate';
    }

    if (this.selectedTab() === 'gateway') {
      return 'asset-management.gateways.feedback-duplicate';
    }

    if (this.selectedTab() === 'location') {
      return 'asset-management.locations.feedback-duplicate';
    }

    return `asset-management.sections.${this.selectedAssetType()}.feedback-duplicate`;
  }

  protected internalIdPlaceholder(): string {
    return this.selectedAssetType() === AssetType.Transport ? 'TR-10001' : 'CR-42312';
  }

  protected namePlaceholderKey(): string {
    return `asset-management.sections.${this.selectedAssetType()}.name-placeholder`;
  }

  protected statusLabelKey(status: AssetStatus): string {
    return `asset-management.status.${status}`;
  }

  protected assetStatusLabel(status: AssetStatus): string {
    return this.translate.instant(this.statusLabelKey(status));
  }

  protected connectivityLabelKey(connectivity: ConnectivityStatus): string {
    return `asset-management.connectivity.${connectivity}`;
  }

  protected displayedConnectivity(asset: Asset): ConnectivityStatus {
    return this.assetManagementStore.connectivityForAsset(
      asset,
      this.organizationIoTDevices(),
      this.organizationGateways(),
    );
  }

  protected calibrationLabelKey(status: CalibrationStatus): string {
    return `asset-management.iot-devices.calibration-status.${status}`;
  }

  protected deviceTypeLabelKey(deviceType: string): string {
    return `asset-management.iot-devices.device-types.${deviceType}`;
  }

  protected selectIoTDeviceType(deviceType: string): void {
    const parameters = this.measurementParametersForDeviceType(deviceType);
    this.iotDeviceForm.controls.measurementType.setValue(this.measurementTypeLabel(parameters));

    if (!this.iotDeviceForm.controls.model.value.trim()) {
      this.iotDeviceForm.controls.model.setValue(
        this.iotDeviceDefinitions.find((definition) => definition.type === deviceType)
          ?.modelPlaceholder ?? '',
      );
    }
  }

  protected measurementParameterLabelKey(parameter: string): string {
    return `asset-management.iot-devices.measurement-parameters.${parameter}`;
  }

  protected measurementParametersFor(iotDevice: IoTDevice): string[] {
    return iotDevice.measurementParameters.length
      ? iotDevice.measurementParameters
      : this.measurementParametersForDeviceType(iotDevice.deviceType);
  }

  protected selectedIoTDeviceParameters(): string[] {
    return this.measurementParametersForDeviceType(this.iotDeviceForm.controls.deviceType.value);
  }

  protected gatewayStatusLabelKey(status: GatewayStatus): string {
    return `asset-management.gateways.status.${status}`;
  }

  protected locationTypeLabelKey(type: string): string {
    return `asset-management.locations.types.${type}`;
  }

  protected locationStatusLabelKey(status: string): string {
    return `asset-management.locations.status.${status}`;
  }

  protected assetStatusToneClass(status: AssetStatus): string {
    const classByStatus: Record<AssetStatus, string> = {
      [AssetStatus.Active]: 'tone-success',
      [AssetStatus.Maintenance]: 'tone-warning',
      [AssetStatus.Inactive]: 'tone-danger',
    };

    return classByStatus[status];
  }

  protected iotDeviceStatusToneClass(status: IoTDeviceStatus): string {
    const classByStatus: Record<IoTDeviceStatus, string> = {
      [IoTDeviceStatus.Linked]: 'tone-success',
      [IoTDeviceStatus.Available]: 'tone-neutral',
      [IoTDeviceStatus.Offline]: 'tone-danger',
    };

    return classByStatus[status];
  }

  protected calibrationToneClass(status: CalibrationStatus): string {
    const classByStatus: Record<CalibrationStatus, string> = {
      [CalibrationStatus.Compliant]: 'tone-success',
      [CalibrationStatus.DueSoon]: 'tone-warning',
      [CalibrationStatus.Expired]: 'tone-danger',
      [CalibrationStatus.Unknown]: 'tone-neutral',
    };

    return classByStatus[status];
  }

  protected gatewayStatusToneClass(status: GatewayStatus): string {
    const classByStatus: Record<GatewayStatus, string> = {
      [GatewayStatus.Active]: 'tone-success',
      [GatewayStatus.Maintenance]: 'tone-warning',
      [GatewayStatus.Offline]: 'tone-danger',
    };

    return classByStatus[status];
  }

  protected locationStatusToneClass(status: string): string {
    const classByStatus: Record<string, string> = {
      active: 'tone-success',
      maintenance: 'tone-warning',
      inactive: 'tone-danger',
    };

    return classByStatus[status] ?? 'tone-neutral';
  }

  protected selectedLocationForForm(): string {
    const locationId = Number(this.coldRoomForm.controls.locationId.value);

    return this.assetManagementStore.locationNameById(locationId, this.organizationLocations());
  }

  protected assetLocationFor(asset: Asset): string {
    return this.assetManagementStore.locationForAsset(asset, this.organizationLocations());
  }

  protected gatewayLocationFor(gateway: Gateway): string {
    return this.assetManagementStore.locationForGateway(gateway, this.organizationLocations());
  }

  protected incidentLabelKey(lastIncident: string): string {
    return `asset-management.incidents.${this.normalizeIncident(lastIncident)}`;
  }

  protected incidentIconName(lastIncident: string): string {
    const iconByIncident: Record<string, string> = {
      'high-temperature': 'warning',
      'connection-lost': 'report',
      'high-humidity': 'warning_amber',
      'low-humidity': 'water_drop',
      'low-temperature': 'change_history',
      none: 'check_circle',
    };

    return iconByIncident[this.normalizeIncident(lastIncident)] ?? 'info';
  }

  protected incidentSeverityClass(lastIncident: string): string {
    const classByIncident: Record<string, string> = {
      'high-temperature': 'danger',
      'connection-lost': 'danger',
      'high-humidity': 'warning',
      'low-humidity': 'warning',
      'low-temperature': 'cold',
      none: 'stable',
    };

    return classByIncident[this.normalizeIncident(lastIncident)] ?? 'stable';
  }

  private normalizeIncident(lastIncident: string): string {
    const prefix = 'asset-management.incidents.';
    return lastIncident.startsWith(prefix) ? lastIncident.slice(prefix.length) : lastIncident;
  }

  protected hasControlError(controlName: keyof typeof this.coldRoomForm.controls): boolean {
    const control = this.coldRoomForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected hasIoTDeviceControlError(
    controlName: keyof typeof this.iotDeviceForm.controls,
  ): boolean {
    const control = this.iotDeviceForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected hasGatewayControlError(controlName: keyof typeof this.gatewayForm.controls): boolean {
    const control = this.gatewayForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected hasLocationControlError(controlName: keyof typeof this.locationForm.controls): boolean {
    const control = this.locationForm.controls[controlName];
    return control.invalid && (control.touched || this.submitted());
  }

  protected logout(): void {
    this.identityAccessStore.clearCurrentUser();
    void this.router.navigate(['/identity-access/sign-in']);
  }

  protected updateAssetPage(page: number): void {
    this.assetPage.set(page);
  }

  protected updateIoTDevicePage(page: number): void {
    this.iotDevicePage.set(page);
  }

  protected updateGatewayPage(page: number): void {
    this.gatewayPage.set(page);
  }

  protected updateLocationPage(page: number): void {
    this.locationPage.set(page);
  }

  private activeOrganizationId(): number | null {
    return this.identityAccessStore.currentOrganizationIdFrom(this.users());
  }

  private paginate<T>(items: T[], page: number): T[] {
    const startIndex = (page - 1) * this.pageSize;
    return items.slice(startIndex, startIndex + this.pageSize);
  }

  private lastPageFor(items: unknown[]): number {
    return Math.max(Math.ceil(items.length / this.pageSize), 1);
  }

  private entryDate(): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
  }

  private calibrationCount(status: CalibrationStatus): number {
    return this.organizationIoTDevices().filter((iotDevice) => {
      return iotDevice.calibrationStatus === status;
    }).length;
  }

  private resetForms(): void {
    this.resetForm();
    this.resetIoTDeviceForm();
    this.resetGatewayForm();
    this.resetLocationForm();
  }

  private resetForm(): void {
    this.coldRoomForm.reset({
      internalId: this.generatedAssetUuid(this.selectedAssetType()),
      name: '',
      locationId: 0,
      capacity: 0,
      description: '',
      status: AssetStatus.Active,
    });
  }

  private resetIoTDeviceForm(): void {
    this.iotDeviceForm.reset({
      internalId: this.generatedIoTDeviceUuid(),
      gatewayId: 0,
      deviceType: '',
      model: '',
      measurementType: '',
      assetId: 0,
      status: IoTDeviceStatus.Available,
      calibrationStatus: CalibrationStatus.Unknown,
      lastCalibrationDate: '',
      nextCalibrationDate: '',
      readingFrequencyMinutes: 60,
    });
  }

  private resetGatewayForm(): void {
    this.gatewayForm.reset({
      internalId: this.generatedGatewayUuid(),
      name: '',
      locationId: 0,
      network: '',
      status: GatewayStatus.Active,
    });
  }

  private resetLocationForm(): void {
    this.locationForm.reset({
      name: '',
      type: 'WAREHOUSE',
      address: '',
      description: '',
      status: 'active',
    });
  }

  private locationTypeFormValue(type: string): string {
    return this.locationTypes.includes(type)
      ? type
      : (this.locationTypeFormAliases[type] ?? 'WAREHOUSE');
  }

  private measurementParametersForDeviceType(deviceType: string): IoTMeasurementParameter[] {
    return (
      this.iotDeviceDefinitions.find((definition) => definition.type === deviceType)?.parameters ??
      []
    );
  }

  private measurementTypeLabel(parameters: string[]): string {
    return parameters
      .map((parameter) => this.translate.instant(this.measurementParameterLabelKey(parameter)))
      .join(' / ');
  }

  private blankIfPlaceholder(value: string): string {
    return value === '—' ? '' : value;
  }

  private nextAsset(
    asset: Asset,
    fields: Partial<{
      status: AssetStatus;
      lastIncident: string;
      currentTemperature: string;
      connectivity: ConnectivityStatus;
    }>,
  ): Asset {
    return new Asset(
      asset.id,
      asset.organizationId,
      asset.uuid,
      asset.type,
      asset.locationId,
      asset.name,
      asset.capacity,
      asset.description,
      fields.status ?? asset.status,
      fields.lastIncident ?? asset.lastIncident,
      fields.currentTemperature ?? asset.currentTemperature,
      asset.entryDate,
      fields.connectivity ?? asset.connectivity,
    );
  }

  private clearPendingAssetStatus(assetId: number): void {
    this.pendingAssetStatuses.update((statuses) => {
      const nextStatuses = { ...statuses };
      delete nextStatuses[assetId];
      return nextStatuses;
    });
  }

  protected gatewayNameById(gatewayId: number | null): string {
    const gateway = this.gateways().find((currentGateway) => currentGateway.id === gatewayId);
    return gateway ? this.gatewayDisplayName(gateway) : 'asset-management.gateways.unassigned';
  }

  private gatewayDisplayName(gateway: Gateway): string {
    return `${gateway.uuid} - ${this.gatewayLocationFor(gateway)}`;
  }

  private generatedAssetUuid(assetType: AssetType): string {
    const organizationId = this.activeOrganizationId();
    const currentUuids = this.assets()
      .filter(
        (asset) =>
          (!organizationId || asset.organizationId === organizationId) && asset.type === assetType,
      )
      .map((asset) => asset.uuid);

    if (assetType === AssetType.Transport) {
      return this.generatedUuid('TR', currentUuids, 10000 + currentUuids.length + 1, 5);
    }

    return this.generatedUuid('CR', currentUuids, currentUuids.length + 1, 5);
  }

  private generatedIoTDeviceUuid(): string {
    const organizationId = this.activeOrganizationId();
    const currentUuids = this.iotDevices()
      .filter((iotDevice) => !organizationId || iotDevice.organizationId === organizationId)
      .map((iotDevice) => iotDevice.uuid);

    return this.generatedUuid('SN', currentUuids, currentUuids.length + 1, 3);
  }

  private generatedGatewayUuid(): string {
    const organizationId = this.activeOrganizationId();
    const currentUuids = this.gateways()
      .filter((gateway) => !organizationId || gateway.organizationId === organizationId)
      .map((gateway) => gateway.uuid);

    return this.generatedUuid('GW', currentUuids, currentUuids.length + 1, 3);
  }

  private nextLocationId(): number {
    return Math.max(...this.locations().map((location) => location.id), 0) + 1;
  }

  private generatedUuid(
    prefix: string,
    currentUuids: string[],
    firstNumber: number,
    width: number,
  ): string {
    const normalizedUuids = new Set(currentUuids.map((uuid) => uuid.toLowerCase()));
    let nextNumber = firstNumber;
    let candidate = '';

    do {
      candidate = `${prefix}-${nextNumber.toString().padStart(width, '0')}`;
      nextNumber += 1;
    } while (normalizedUuids.has(candidate.toLowerCase()));

    return candidate;
  }
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { AssetManagementStore } from '../../../../asset-management/application/asset-management.store';
import { IdentityAccessStore } from '../../../../identity-access/application/identity-access.store';
import { MonitoringStore } from '../../../application/monitoring.store';
import { AssetMonitoringDashboard } from './asset-monitoring-dashboard';

class IdentityAccessStoreStub {
  users = signal([]);
  roles = signal([]);

  loadUsers(): void {}
  loadOrganizations(): void {}
  loadRoles(): void {}
  currentOrganizationIdFrom(): number {
    return 1;
  }
  canMonitorAssets(): boolean {
    return true;
  }
}

class AssetManagementStoreStub {
  loadAssets(): void {}
  loadIoTDevices(): void {}
  loadGateways(): void {}
  loadAssetSettings(): void {}
  assetsForOrganization(): unknown[] {
    return [];
  }
  iotDevicesForOrganization(): unknown[] {
    return [];
  }
  settingsForAsset(): undefined {
    return undefined;
  }
  locationForAsset(): string {
    return '';
  }
}

class MonitoringStoreStub {
  loadReadings(): void {}
  getReadingsByAsset(): unknown[] {
    return [];
  }
}

describe('AssetMonitoringDashboard', () => {
  let component: AssetMonitoringDashboard;
  let fixture: ComponentFixture<AssetMonitoringDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetMonitoringDashboard],
      providers: [
        provideTranslateService(),
        { provide: IdentityAccessStore, useClass: IdentityAccessStoreStub },
        { provide: AssetManagementStore, useClass: AssetManagementStoreStub },
        { provide: MonitoringStore, useClass: MonitoringStoreStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssetMonitoringDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

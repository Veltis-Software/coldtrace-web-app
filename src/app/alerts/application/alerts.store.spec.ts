import { of, throwError } from 'rxjs';
import { AssetManagementApi } from '../../asset-management/infrastructure/asset-management-api';
import { IdentityAccessStore } from '../../identity-access/application/identity-access.store';
import { MonitoringApi } from '../../monitoring/infrastructure/monitoring-api';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { AlertsApi } from '../infrastructure/alerts-api';
import { AlertsStore } from './alerts.store';

describe('AlertsStore server-owned detection', () => {
  it('reads incidents without creating browser-side incidents or escalation writes', () => {
    const api = { getIncidents: vi.fn(() => of([])), getNotifications: vi.fn(() => of([])), createIncident: vi.fn(), updateIncident: vi.fn() };
    const monitoring = { getSensorReadings: vi.fn() };
    const assets = { getAssets: vi.fn(), getAssetSettings: vi.fn() };
    const scope = new OrganizationScopeStore();
    scope.setActiveOrganizationId(1);
    const store = new AlertsStore(api as unknown as AlertsApi, {} as IdentityAccessStore,
      monitoring as unknown as MonitoringApi, assets as unknown as AssetManagementApi, scope);
    store.loadIncidents({ force: true });
    expect(api.getIncidents).toHaveBeenCalledOnce();
    expect(api.createIncident).not.toHaveBeenCalled();
    expect(api.updateIncident).not.toHaveBeenCalled();
    expect(monitoring.getSensorReadings).not.toHaveBeenCalled();
    expect(assets.getAssets).not.toHaveBeenCalled();
  });

  it('shows an owner failure without inventing a replacement incident list', () => {
    const api = { getIncidents: vi.fn(() => throwError(() => new Error('Owner unavailable'))), getNotifications: vi.fn(() => of([])), createIncident: vi.fn() };
    const scope = new OrganizationScopeStore();
    scope.setActiveOrganizationId(1);
    const store = new AlertsStore(api as unknown as AlertsApi, {} as IdentityAccessStore,
      {} as MonitoringApi, {} as AssetManagementApi, scope);
    store.loadIncidents();
    expect(store.error()).toBe('Owner unavailable');
    expect(api.createIncident).not.toHaveBeenCalled();
  });
});

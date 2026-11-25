import { Subject } from 'rxjs';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { SensorReading } from '../domain/model/sensor-reading.entity';
import { MonitoringApi } from '../infrastructure/monitoring-api';
import { MonitoringStore } from './monitoring.store';

describe('MonitoringStore received telemetry', () => {
  let scope: OrganizationScopeStore;
  let responses: Subject<SensorReading[]>[];
  let api: { getSensorReadings: ReturnType<typeof vi.fn>; generateDemoSensorReadings: ReturnType<typeof vi.fn> };
  let store: MonitoringStore;

  beforeEach(() => {
    scope = new OrganizationScopeStore();
    scope.setActiveOrganizationId(1);
    responses = [];
    api = {
      getSensorReadings: vi.fn(() => {
        const response = new Subject<SensorReading[]>();
        responses.push(response);
        return response;
      }),
      generateDemoSensorReadings: vi.fn(),
    };
    store = new MonitoringStore(api as unknown as MonitoringApi, scope);
  });

  it('refreshes received measurements without creating synthetic readings', () => {
    store.updateOrganizationTelemetry(1);
    responses[0].next([]);
    store.updateOrganizationTelemetry(1);
    expect(api.getSensorReadings).toHaveBeenCalledTimes(2);
    expect(api.generateDemoSensorReadings).not.toHaveBeenCalled();
    expect(store.readings()).toEqual([]);
  });

  it('keeps one refresh in flight rather than racing polling responses', () => {
    store.updateOrganizationTelemetry(1);
    store.updateOrganizationTelemetry(1);
    expect(api.getSensorReadings).toHaveBeenCalledTimes(1);
  });

  it('ignores a previous organizations late response after a tenant switch', () => {
    store.loadReadings();
    scope.setActiveOrganizationId(2);
    store.loadReadings();
    responses[1].next([new SensorReading(2, 20, 30, null, null, false, '2026-11-05T06:00:00Z')]);
    responses[0].next([new SensorReading(1, 10, 15, null, null, false, '2026-11-05T06:00:00Z')]);
    expect(store.readings().map((reading) => reading.id)).toEqual([2]);
  });
});

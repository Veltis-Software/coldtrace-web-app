import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Asset } from '../../../../asset-management/domain/model/asset.entity';
import { AssetStatus } from '../../../../asset-management/domain/model/asset-status.enum';
import { AssetType } from '../../../../asset-management/domain/model/asset-type.enum';
import { ConnectivityStatus } from '../../../../asset-management/domain/model/connectivity-status.enum';
import { MonitoringAssetCard } from './monitoring-asset-card';
import { SensorReading } from '../../../domain/model/sensor-reading.entity';

describe('MonitoringAssetCard', () => {
  let component: MonitoringAssetCard;
  let fixture: ComponentFixture<MonitoringAssetCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitoringAssetCard],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(MonitoringAssetCard);
    component = fixture.componentInstance;
    component.asset = new Asset(
      1,
      1,
      'CR-001',
      AssetType.ColdRoom,
      1,
      'Cold Room 01',
      1200,
      'Main cold room',
      AssetStatus.Active,
      'none',
      '4.2°C',
      '2026-05-12',
      ConnectivityStatus.Online,
    );
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the last measurement visible without treating missing telemetry as normal', () => {
    fixture.componentRef.setInput(
      'latestReading',
      new SensorReading(1, 1, 1, 4.2, 60, false, '2026-10-22T20:00:00Z'),
    );
    fixture.componentRef.setInput('telemetryState', 'NO_DATA');
    fixture.detectChanges();
    expect(component.temperature).toBe(4.2);
    expect(component.statusKey).toBe('increment.states.NO_DATA');
    expect(fixture.nativeElement.querySelector('.status-badge').classList.contains('no-data')).toBe(
      true,
    );
    expect(fixture.nativeElement.textContent).toContain('increment.stale-reading');
  });

  it('uses the evaluated range from Monitoring instead of a stale asset value', () => {
    component.telemetryState = 'OUT_OF_RANGE';
    component.safeRange = { minTemperature: 2, maxTemperature: 8 };
    expect(component.temperature).toBeNull();
    expect(component.minimumTemperature).toBe(2);
    expect(component.maximumTemperature).toBe(8);
    expect(component.hasIncident).toBe(true);
  });
});

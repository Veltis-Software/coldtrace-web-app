import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { IoTDevice } from '../../../domain/model/iot-device.entity';
import {
  SourceConfiguration as Configuration,
  SourceConfigurationsApi,
} from '../../../infrastructure/source-configurations-api';
import { SourceConfiguration } from './source-configuration';

describe('SourceConfiguration', () => {
  const configuration: Configuration = {
    organizationId: 7,
    deviceId: 10,
    deviceUuid: 'e846df25-9981-4911-9552-4143bf79f596',
    gatewayId: 3,
    assetId: 20,
    configurationVersion: 4,
    changedBy: 12,
    changedAt: '2026-11-03T12:00:00Z',
    reason: 'Instalación',
    profile: {
      sourceId: 'probe-a',
      transport: 'mqtt',
      profileVersion: 1,
      schemaVersion: 1,
      temperatureUnit: 'C',
      humidityUnit: '%RH',
      fields: { temperature: 'temp', humidity: 'rh', recordedAt: 'timestamp' },
    },
  };
  const device = {
    id: 10,
    organizationId: 7,
    gatewayId: 3,
    assetId: 20,
    uuid: configuration.deviceUuid,
  } as IoTDevice;
  let api: {
    current: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
    configure: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      current: vi.fn(() => of(configuration)),
      history: vi.fn(() => of([configuration])),
      configure: vi.fn(() => of({ ...configuration, configurationVersion: 5 })),
    };
    TestBed.configureTestingModule({
      imports: [SourceConfiguration],
      providers: [provideTranslateService(), { provide: SourceConfigurationsApi, useValue: api }],
    });
  });
  function create(canManage = true) {
    const fixture = TestBed.createComponent(SourceConfiguration);
    fixture.componentRef.setInput('device', device);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.detectChanges();
    return fixture;
  }

  it('queries the device organization and renders real configuration and history', () => {
    const fixture = create();
    expect(api.current).toHaveBeenCalledWith(7, 10);
    expect(api.history).toHaveBeenCalledWith(7, 10);
    expect(fixture.nativeElement.textContent).toContain('probe-a');
    expect(fixture.nativeElement.textContent).toContain('Instalación');
    expect(fixture.componentInstance.history()).toHaveLength(1);
  });

  it('saves using the loaded revision, immutable asset and explicit reason', () => {
    const component = create().componentInstance;
    component.edit();
    component.form.patchValue({ sourceId: 'probe-b', reason: 'Sustitución por calibración' });
    component.submit();
    expect(api.configure).toHaveBeenCalledWith(
      7,
      10,
      expect.objectContaining({
        expectedVersion: 4,
        assetId: 20,
        sourceId: 'probe-b',
        reason: 'Sustitución por calibración',
        schemaVersion: 1,
      }),
    );
    expect(component.success()).toBe(true);
    expect(component.history()).toHaveLength(2);
  });

  it('retains the form on conflict and requires reload before another confirmation', () => {
    api.configure.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const component = create().componentInstance;
    component.edit();
    component.form.patchValue({ reason: 'Reemplazo' });
    component.submit();
    expect(component.error()).toBe('source-config.conflict');
    expect(component.form.controls.reason.value).toBe('Reemplazo');
    expect(component.current()?.configurationVersion).toBe(4);
    component.submit();
    expect(api.configure).toHaveBeenCalledTimes(1);
  });

  it('does not write for readers or ambiguous fields', () => {
    const reader = create(false);
    reader.componentInstance.submit();
    expect(reader.nativeElement.querySelector('form')).toBeNull();
    reader.destroy();
    const component = create().componentInstance;
    component.edit();
    component.form.patchValue({ reason: 'Actualización', humidityField: 'temp' });
    component.submit();
    expect(component.error()).toBe('source-config.validation-error');
    expect(api.configure).not.toHaveBeenCalled();
  });

  it('cancels an earlier device query so it cannot overwrite the next device', () => {
    const pending = new Subject<Configuration>();
    api.current.mockReturnValueOnce(pending);
    const fixture = create();
    fixture.componentRef.setInput('device', { ...device, id: 11 });
    fixture.detectChanges();
    pending.next({ ...configuration, configurationVersion: 99 });
    pending.complete();
    expect(fixture.componentInstance.current()?.configurationVersion).toBe(4);
    expect(api.current).toHaveBeenLastCalledWith(7, 11);
  });

  it('keeps a draft when only the asset list refreshes', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    component.edit();
    component.form.patchValue({ reason: 'Cambio de sonda durante mantenimiento' });
    fixture.componentRef.setInput('assets', []);
    fixture.detectChanges();
    expect(component.editing()).toBe(true);
    expect(component.form.controls.reason.value).toBe('Cambio de sonda durante mantenimiento');
    expect(api.current).toHaveBeenCalledTimes(1);
  });

  it('closes editing when management permission is revoked', () => {
    const fixture = create();
    fixture.componentInstance.edit();
    fixture.componentRef.setInput('canManage', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.editing()).toBe(false);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    fixture.componentInstance.submit();
    expect(api.configure).not.toHaveBeenCalled();
  });

  it('shows denied reads without offering to create a missing configuration', () => {
    api.current.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const fixture = create();
    const component = fixture.componentInstance;
    expect(component.error()).toBe('source-config.read-forbidden');
    expect(component.loadFailed()).toBe(true);
    component.edit();
    component.submit();
    expect(component.editing()).toBe(false);
    expect(api.configure).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('source-config.empty');
  });

  it('allows initial association only after a genuine missing configuration and successful history read', () => {
    api.current.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    api.history.mockReturnValue(of([]));
    const component = create().componentInstance;
    expect(component.loadFailed()).toBe(false);
    expect(component.current()).toBeNull();
    component.edit();
    component.form.patchValue({ sourceId: 'probe-a', reason: 'Instalación inicial' });
    component.submit();
    expect(api.configure).toHaveBeenCalledWith(
      7,
      10,
      expect.objectContaining({ expectedVersion: 0, assetId: 20 }),
    );
  });
});

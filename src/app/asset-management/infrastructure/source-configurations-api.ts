import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';

export interface SourceProfile {
  sourceId: string;
  transport: 'mqtt' | 'http';
  profileVersion: number;
  schemaVersion: number;
  fields: { temperature: string; humidity: string; recordedAt: string };
  temperatureUnit: 'C' | 'F';
  humidityUnit: '%RH';
}
export interface SourceConfiguration {
  organizationId: number;
  deviceId: number;
  deviceUuid: string;
  gatewayId: number;
  assetId: number;
  configurationVersion: number;
  profile: SourceProfile;
  changedBy: number;
  changedAt: string;
  reason: string;
}
export interface ConfigureSourceRequest extends SourceProfile {
  assetId: number;
  expectedVersion: number;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class SourceConfigurationsApi {
  private readonly http = inject(HttpClient);
  private readonly scope = inject(OrganizationScopeStore);
  private url(org: number, device: number) {
    return this.scope.endpointUrlForOrganization(org, `iot-devices/${device}/source-configuration`);
  }
  current(org: number, device: number) {
    return this.http.get<SourceConfiguration>(this.url(org, device));
  }
  history(org: number, device: number) {
    return this.http.get<SourceConfiguration[]>(this.url(org, device) + '/history');
  }
  configure(org: number, device: number, body: ConfigureSourceRequest) {
    return this.http.put<SourceConfiguration>(this.url(org, device), body);
  }
}

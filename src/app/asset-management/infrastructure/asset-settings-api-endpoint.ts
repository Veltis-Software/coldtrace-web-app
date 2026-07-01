import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { AssetSettings } from '../domain/model/asset-settings.entity';
import { AssetSettingsAssembler } from './asset-settings-assembler';
import { AssetSettingsResource, AssetSettingsResponse } from './asset-settings-response';

/**
 * @summary Connects asset settings API endpoint resources to the generic API endpoint contract.
 */
export class AssetSettingsApiEndpoint extends BaseApiEndpoint<
  AssetSettings,
  AssetSettingsResource,
  AssetSettingsResponse,
  AssetSettingsAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new AssetSettingsAssembler());
  }

  /**
   * @summary Fetches asset settings for the active organization.
   */
  override getAll(): Observable<AssetSettings[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Saves default or asset-specific settings using the backend command endpoint.
   */
  override create(entity: AssetSettings): Observable<AssetSettings> {
    return this.save(entity);
  }

  /**
   * @summary Saves default or asset-specific settings using the backend command endpoint.
   */
  override update(entity: AssetSettings, _id?: number): Observable<AssetSettings> {
    return this.save(entity);
  }

  /**
   * @summary Reads the effective settings resolved by the backend for one asset.
   */
  getByAssetId(assetId: number): Observable<AssetSettings> {
    const organizationUrl = this.activeOrganizationUrl();

    if (!organizationUrl) {
      return throwError(() => new Error('No active organization selected'));
    }

    const url = `${organizationUrl}/assets/${assetId}/settings`;

    return this.http.get<AssetSettingsResource>(url).pipe(
      map((resource) => this.assembler.toEntityFromResource(resource)),
      catchError(this.handleError('Failed to fetch asset settings')),
    );
  }

  private save(entity: AssetSettings): Observable<AssetSettings> {
    const resource = this.toSaveResource(entity);
    const organizationUrl = this.activeOrganizationUrl();
    const endpointUrl = this.activeEndpointUrl();

    if (!organizationUrl || !endpointUrl) {
      return throwError(() => new Error('No active organization selected'));
    }

    const url = entity.assetId
      ? `${organizationUrl}/assets/${entity.assetId}/settings`
      : `${endpointUrl}/default`;

    return this.http.put<AssetSettingsResource>(url, resource).pipe(
      map((saved) => this.assembler.toEntityFromResource(saved)),
      catchError(this.handleError('Failed to save asset settings')),
    );
  }

  private toSaveResource(entity: AssetSettings): Partial<AssetSettingsResource> {
    return {
      uuid: entity.uuid,
      assetTypes: entity.assetTypes,
      iotDeviceTypes: entity.iotDeviceTypes,
      minimumTemperature: entity.minimumTemperature,
      maximumTemperature: entity.maximumTemperature,
      minimumHumidity: entity.minimumHumidity,
      maximumHumidity: entity.maximumHumidity,
      calibrationFrequencyDays: entity.calibrationFrequencyDays,
      temperatureUnit: entity.temperatureUnit,
      humidityUnit: entity.humidityUnit,
      weightUnit: entity.weightUnit,
      readingFrequencySeconds: entity.readingFrequencySeconds,
      alertThresholdMinutes: entity.alertThresholdMinutes,
    };
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.activeEndpointUrl();
  }

  private activeEndpointUrl(): string {
    return this.organizationScope.endpointUrlFor('asset-settings');
  }

  private activeOrganizationUrl(): string {
    return this.organizationScope.organizationUrl();
  }
}

import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable } from 'rxjs';
import { BaseApiEndpoint } from '../../shared/infrastructure/base-api-endpoint';
import { OrganizationScopeStore } from '../../shared/infrastructure/organization-scope.store';
import { Asset } from '../domain/model/asset.entity';
import { AssetAssembler } from './asset-assembler';
import { AssetResource, AssetsResponse, CreateAssetRequest, UpdateAssetRequest } from './assets-response';

/**
 * @summary Connects assets API endpoint resources to the generic API endpoint contract.
 */
export class AssetsApiEndpoint extends BaseApiEndpoint<
  Asset,
  AssetResource,
  AssetsResponse,
  AssetAssembler
> {
  constructor(http: HttpClient, private organizationScope: OrganizationScopeStore) {
    super(http, '', new AssetAssembler());
  }

  /**
   * @summary Fetches assets for the active organization.
   */
  override getAll(): Observable<Asset[]> {
    this.useActiveOrganizationEndpoint();
    return super.getAll();
  }

  /**
   * @summary Creates an asset using the backend request contract.
   */
  override create(asset: Asset): Observable<Asset> {
    this.useActiveOrganizationEndpoint();

    return this.http.post<AssetResource>(this.endpointUrl, this.toRequest(asset)).pipe(
      map((created) => this.assembler.toEntityFromResource(created)),
      catchError(this.handleError('Failed to create asset')),
    );
  }

  /**
   * @summary Updates an asset using the backend request contract.
   */
  override update(asset: Asset, id: number): Observable<Asset> {
    this.useActiveOrganizationEndpoint();

    return this.http.put<AssetResource>(`${this.endpointUrl}/${id}`, this.toRequest(asset)).pipe(
      map((updated) => this.assembler.toEntityFromResource(updated)),
      catchError(this.handleError('Failed to update asset')),
    );
  }

  private toRequest(asset: Asset): CreateAssetRequest | UpdateAssetRequest {
    return {
      locationId: asset.locationId,
      uuid: asset.uuid,
      type: asset.type,
      name: asset.name,
      capacity: asset.capacity,
      description: asset.description,
      status: asset.status,
    };
  }

  private useActiveOrganizationEndpoint(): void {
    this.endpointUrl = this.organizationScope.endpointUrlFor('assets');
  }
}

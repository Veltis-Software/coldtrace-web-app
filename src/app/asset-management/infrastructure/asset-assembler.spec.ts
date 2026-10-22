import { AssetAssembler } from './asset-assembler';
import { AssetResource } from './assets-response';
import { AssetType } from '../domain/model/asset-type.enum';

describe('Asset API type compatibility', () => {
  it('keeps a migrated cold room visible in the existing monitoring tab', () => {
    const resource = {id: 4, organizationId: 3, type: 'COLD_ROOM'} as unknown as AssetResource;
    expect(new AssetAssembler().toEntityFromResource(resource).type).toBe(AssetType.ColdRoom);
  });

  it('preserves the original frontend type when it is already normalized', () => {
    const resource = {id: 4, organizationId: 3, type: 'transport'} as unknown as AssetResource;
    expect(new AssetAssembler().toEntityFromResource(resource).type).toBe(AssetType.Transport);
  });
});

export type { Asset, AssetInput, AssetType } from '@/shared/api/generated/model'
export {
  assetKeys,
  assetTypeKeys,
  createAsset,
  deleteAsset,
  getAsset,
  listAssetTypes,
  listLocationAssets,
  updateAsset,
  useCreateAsset,
  useDeleteAsset,
  useListAssetTypes,
  useUpdateAsset,
} from './api'
export {
  assetFormValues,
  type AssetFormValues,
  buildAssetSchema,
  toAssetBody,
} from './model/asset-form'
export { AssetFields } from './ui/asset-fields'
export { AssetSummary } from './ui/asset-summary'

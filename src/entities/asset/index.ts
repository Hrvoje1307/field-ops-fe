export type { Asset, AssetInput, AssetType, AssetTypeInput } from '@/shared/api/generated/model'
export {
  assetKeys,
  assetTypeKeys,
  createAsset,
  createAssetType,
  deleteAsset,
  deleteAssetType,
  getAsset,
  listAssetTypes,
  listLocationAssets,
  updateAsset,
  updateAssetType,
  useCreateAsset,
  useCreateAssetType,
  useDeleteAsset,
  useDeleteAssetType,
  useListAssetTypes,
  useUpdateAsset,
  useUpdateAssetType,
} from './api'
export {
  assetFormValues,
  type AssetFormValues,
  buildAssetSchema,
  toAssetBody,
} from './model/asset-form'
export {
  assetTypeFormValues,
  type AssetTypeFormValues,
  buildAssetTypeSchema,
  toAssetTypeBody,
} from './model/asset-type-form'
export { AssetFields } from './ui/asset-fields'
export { AssetSummary } from './ui/asset-summary'

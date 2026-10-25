export type { Depot, DepotInput } from '@/shared/api/generated/model'
export {
  createDepot,
  deleteDepot,
  depotKeys,
  listDepots,
  updateDepot,
  useCreateDepot,
  useDeleteDepot,
  useListDepots,
  useUpdateDepot,
} from './api'
export {
  buildDepotSchema,
  depotFormValues,
  type DepotFormValues,
  toDepotBody,
} from './model/depot-form'

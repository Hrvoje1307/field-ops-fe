export type {
  DispatchBoard,
  DispatchBoardColumnsItem,
  OptimizeRoutesBody,
  Route,
  RoutePlan,
  RoutePlanStatus,
  RoutePlanUnassignedItem,
  UnassignedReason,
  UpdateRoutePlanBodyRoutesItem,
} from '@/shared/api/generated/model'
export {
  dispatchKeys,
  getDispatchBoard,
  getRoutePlan,
  optimizeRoutePlan,
  publishRoutePlan,
  updateRoutePlan,
  useGetDispatchBoard,
  useGetRoutePlan,
  useOptimizeRoutePlan,
  usePublishRoutePlan,
  useUpdateRoutePlan,
} from './api'

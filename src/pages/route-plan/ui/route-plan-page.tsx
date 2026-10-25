import { RoutePlanView } from '@/features/schedule/route-plan'

/** A route plan of one day: a draft to correct and publish, or a plan to look at. */
export function RoutePlanPage({ planId }: { planId: string }) {
  return <RoutePlanView planId={planId} />
}

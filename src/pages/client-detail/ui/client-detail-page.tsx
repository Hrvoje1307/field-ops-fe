import { ClientDetailView } from '@/widgets/client-detail'

export function ClientDetailPage({ clientId }: { clientId: string }) {
  return <ClientDetailView clientId={clientId} />
}

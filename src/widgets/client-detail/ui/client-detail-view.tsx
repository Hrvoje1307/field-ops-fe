import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AssetEditorButton, DeleteAssetButton } from '@/features/asset/edit'
import { ClientDetails } from '@/features/client/details'
import { DeleteClientButton, EditClientButton } from '@/features/client/edit'
import { ClientJobs } from '@/features/job/client-jobs'
import { DeleteLocationButton, LocationEditorButton } from '@/features/location/edit'
import { Button } from '@/shared/ui/button'

/**
 * A client for the office: details with edit and delete for the client, its locations
 * and equipment, and the client's jobs with "Novi nalog" for this client.
 */
export function ClientDetailView({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  return (
    <ClientDetails
      clientId={clientId}
      actions={
        <>
          <EditClientButton clientId={clientId} />
          <DeleteClientButton clientId={clientId} />
        </>
      }
      addLocation={<LocationEditorButton clientId={clientId} />}
      locationActions={(location) => (
        <>
          <LocationEditorButton clientId={clientId} location={location} />
          <DeleteLocationButton location={location} />
        </>
      )}
      addAsset={(location) => (
        <AssetEditorButton
          locationId={location.id}
          locationName={location.label ?? location.address}
        />
      )}
      assetActions={(asset) => (
        <>
          <AssetEditorButton locationId={asset.locationId} asset={asset} />
          <DeleteAssetButton asset={asset} />
        </>
      )}
      jobs={
        <div className="space-y-3">
          <ClientJobs clientId={clientId} />
          <Button asChild size="sm">
            <Link to="/jobs/new" search={{ clientId }}>
              <PlusIcon aria-hidden="true" />
              {t('client.detail.newJob')}
            </Link>
          </Button>
        </div>
      }
    />
  )
}

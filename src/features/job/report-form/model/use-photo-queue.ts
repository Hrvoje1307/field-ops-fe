import { useCallback, useRef, useState } from 'react'

import { useUploadJobFile } from '@/entities/report'
import { shrinkPhoto } from '@/shared/lib/image'

import { mimeOf, type PhotoProblem, photoProblem } from './photo-files'

export interface QueuedPhoto {
  id: string
  name: string
  status: 'uploading' | 'failed' | PhotoProblem
}

/**
 * Photos chosen on the phone: each is shrunk and sent one after the other. One that
 * fails stays in the list with its file, so "try again" resumes the same upload; one
 * that went through leaves the list (the report shows it).
 */
export function usePhotoQueue(jobId: string) {
  const upload = useUploadJobFile(jobId)
  const [queue, setQueue] = useState<QueuedPhoto[]>([])
  const files = useRef(new Map<string, { blob: Blob; name: string; takenAt: string }>())
  const chain = useRef<Promise<void>>(Promise.resolve())

  const patch = useCallback((id: string, status: QueuedPhoto['status'] | null) => {
    setQueue((current) =>
      status === null
        ? current.filter((photo) => photo.id !== id)
        : current.map((photo) => (photo.id === id ? { ...photo, status } : photo)),
    )
  }, [])

  const send = useCallback(
    (id: string) => {
      chain.current = chain.current.then(async () => {
        const entry = files.current.get(id)
        if (!entry) return
        patch(id, 'uploading')
        try {
          await upload.mutateAsync({
            kind: 'photo',
            file: entry.blob,
            fileName: entry.name,
            takenAt: entry.takenAt,
          })
          files.current.delete(id)
          patch(id, null)
        } catch {
          patch(id, 'failed')
        }
      })
    },
    [patch, upload],
  )

  const add = useCallback(
    (chosen: File[]) => {
      for (const file of chosen) {
        const id = crypto.randomUUID()
        const first = photoProblem(file)
        if (first === 'unsupported') {
          setQueue((current) => [...current, { id, name: file.name, status: first }])
          continue
        }
        setQueue((current) => [...current, { id, name: file.name, status: 'uploading' }])
        chain.current = chain.current.then(async () => {
          const shrunk = await shrinkPhoto(file)
          // Shrinking gives a JPEG; a file that stayed as it was keeps its own type
          const blob =
            shrunk === file && !file.type
              ? new Blob([file], { type: mimeOf(file) ?? 'image/jpeg' })
              : shrunk
          const problem = photoProblem(file, blob.size)
          if (problem) {
            patch(id, problem)
            return
          }
          files.current.set(id, {
            blob,
            name: file.name,
            takenAt: new Date(file.lastModified || Date.now()).toISOString(),
          })
        })
        send(id)
      }
    },
    [patch, send],
  )

  const retry = useCallback(
    (id: string) => {
      send(id)
    },
    [send],
  )
  const discard = useCallback(
    (id: string) => {
      files.current.delete(id)
      patch(id, null)
    },
    [patch],
  )

  return { queue, add, retry, discard }
}

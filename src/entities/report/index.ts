export type {
  Attachment,
  CatalogItem,
  ChecklistItem,
  JobMaterial,
  JobMaterialInput,
  JobReport,
  JobReportInput,
} from '@/shared/api/generated/model'
export {
  getAttachmentUrl,
  getJobReport,
  listCatalogItems,
  printJobReport,
  reportKeys,
  uploadAttachment,
  useAddJobMaterial,
  useDeleteAttachment,
  useDeleteJobMaterial,
  useGetAttachmentUrl,
  useGetJobReport,
  useListCatalogItems,
  usePrintJobReport,
  useSaveJobReport,
  useSignReport,
  useUpdateChecklist,
  useUploadJobFile,
  useUploadTenantLogo,
} from './api'
export { blockerText, type CompletionBlocker, completionBlockers } from './lib/completion'
export { AttachmentImage } from './ui/attachment-image'

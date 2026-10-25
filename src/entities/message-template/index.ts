export type {
  MessageChannel,
  MessageTemplate,
  MessageTemplateInput,
  MessageTemplateKey,
  PreviewMessageTemplate200,
} from '@/shared/api/generated/model'
export {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  messageTemplateKeys,
  previewMessageTemplate,
  updateMessageTemplate,
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useListMessageTemplates,
  usePreviewMessageTemplate,
  useUpdateMessageTemplate,
} from './api'
export {
  insertAt,
  MESSAGE_KEYS,
  type Placeholder,
  PLACEHOLDERS,
  placeholderText,
} from './lib/placeholders'
export {
  buildTemplateSchema,
  templateFormValues,
  type TemplateFormValues,
  toTemplateBody,
} from './model/template-form'

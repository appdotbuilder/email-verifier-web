
import { z } from 'zod';

// Email validation status enum matching MillionVerifier API responses
export const emailValidationStatusSchema = z.enum([
  'ok',
  'catch_all',
  'unknown',
  'error',
  'disposable',
  'invalid',
  'duplicate'
]);

export type EmailValidationStatus = z.infer<typeof emailValidationStatusSchema>;

// CSV upload schema
export const csvUploadSchema = z.object({
  id: z.number(),
  filename: z.string(),
  original_filename: z.string(),
  file_size: z.number(),
  total_rows: z.number(),
  email_column: z.string().nullable(),
  status: z.enum(['uploaded', 'processing', 'completed', 'failed']),
  created_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable()
});

export type CsvUpload = z.infer<typeof csvUploadSchema>;

// Email record schema
export const emailRecordSchema = z.object({
  id: z.number(),
  upload_id: z.number(),
  row_number: z.number(),
  email: z.string(),
  validation_status: emailValidationStatusSchema.nullable(),
  validation_result: z.string().nullable(), // JSON string of full MillionVerifier response
  additional_data: z.string().nullable(), // JSON string of other CSV columns
  validated_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type EmailRecord = z.infer<typeof emailRecordSchema>;

// Input schemas
export const uploadCsvInputSchema = z.object({
  filename: z.string(),
  content: z.string(), // Base64 encoded CSV content
  email_column: z.string().optional() // Column name containing emails
});

export type UploadCsvInput = z.infer<typeof uploadCsvInputSchema>;

export const validateEmailsInputSchema = z.object({
  upload_id: z.number()
});

export type ValidateEmailsInput = z.infer<typeof validateEmailsInputSchema>;

export const getUploadResultsInputSchema = z.object({
  upload_id: z.number()
});

export type GetUploadResultsInput = z.infer<typeof getUploadResultsInputSchema>;

export const downloadValidatedCsvInputSchema = z.object({
  upload_id: z.number()
});

export type DownloadValidatedCsvInput = z.infer<typeof downloadValidatedCsvInputSchema>;

// Response schemas
export const uploadResponseSchema = z.object({
  upload_id: z.number(),
  filename: z.string(),
  total_rows: z.number(),
  email_column: z.string().nullable(),
  detected_columns: z.array(z.string())
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const validationResultsResponseSchema = z.object({
  upload: csvUploadSchema,
  records: z.array(emailRecordSchema),
  summary: z.object({
    total: z.number(),
    validated: z.number(),
    ok: z.number(),
    invalid: z.number(),
    disposable: z.number(),
    catch_all: z.number(),
    unknown: z.number(),
    error: z.number(),
    duplicate: z.number()
  })
});

export type ValidationResultsResponse = z.infer<typeof validationResultsResponseSchema>;

export const downloadCsvResponseSchema = z.object({
  filename: z.string(),
  content: z.string(), // Base64 encoded CSV content
  mime_type: z.string()
});

export type DownloadCsvResponse = z.infer<typeof downloadCsvResponseSchema>;

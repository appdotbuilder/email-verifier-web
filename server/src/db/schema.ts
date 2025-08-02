
import { serial, text, pgTable, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const uploadStatusEnum = pgEnum('upload_status', ['uploaded', 'processing', 'completed', 'failed']);
export const validationStatusEnum = pgEnum('validation_status', ['ok', 'catch_all', 'unknown', 'error', 'disposable', 'invalid', 'duplicate']);

// CSV uploads table
export const csvUploadsTable = pgTable('csv_uploads', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  original_filename: text('original_filename').notNull(),
  file_size: integer('file_size').notNull(),
  total_rows: integer('total_rows').notNull(),
  email_column: text('email_column'), // Nullable - auto-detected or user specified
  status: uploadStatusEnum('status').notNull().default('uploaded'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at') // Nullable - set when processing completes
});

// Email records table
export const emailRecordsTable = pgTable('email_records', {
  id: serial('id').primaryKey(),
  upload_id: integer('upload_id').notNull().references(() => csvUploadsTable.id, { onDelete: 'cascade' }),
  row_number: integer('row_number').notNull(),
  email: text('email').notNull(),
  validation_status: validationStatusEnum('validation_status'), // Nullable until validated
  validation_result: text('validation_result'), // Nullable - JSON string of full API response
  additional_data: text('additional_data'), // Nullable - JSON string of other CSV columns
  validated_at: timestamp('validated_at'), // Nullable - set when validation completes
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const csvUploadsRelations = relations(csvUploadsTable, ({ many }) => ({
  emailRecords: many(emailRecordsTable)
}));

export const emailRecordsRelations = relations(emailRecordsTable, ({ one }) => ({
  upload: one(csvUploadsTable, {
    fields: [emailRecordsTable.upload_id],
    references: [csvUploadsTable.id]
  })
}));

// TypeScript types for the tables
export type CsvUpload = typeof csvUploadsTable.$inferSelect;
export type NewCsvUpload = typeof csvUploadsTable.$inferInsert;
export type EmailRecord = typeof emailRecordsTable.$inferSelect;
export type NewEmailRecord = typeof emailRecordsTable.$inferInsert;

// Export all tables for proper query building
export const tables = { 
  csvUploads: csvUploadsTable, 
  emailRecords: emailRecordsTable 
};

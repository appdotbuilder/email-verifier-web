
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type GetUploadResultsInput, type ValidationResultsResponse } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUploadResults(input: GetUploadResultsInput): Promise<ValidationResultsResponse> {
  try {
    // Fetch the upload record
    const uploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, input.upload_id))
      .execute();

    if (uploads.length === 0) {
      throw new Error(`Upload with id ${input.upload_id} not found`);
    }

    const upload = uploads[0];

    // Fetch all associated email records
    const records = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, input.upload_id))
      .execute();

    // Calculate summary statistics
    const summary = {
      total: records.length,
      validated: records.filter(r => r.validation_status !== null).length,
      ok: records.filter(r => r.validation_status === 'ok').length,
      invalid: records.filter(r => r.validation_status === 'invalid').length,
      disposable: records.filter(r => r.validation_status === 'disposable').length,
      catch_all: records.filter(r => r.validation_status === 'catch_all').length,
      unknown: records.filter(r => r.validation_status === 'unknown').length,
      error: records.filter(r => r.validation_status === 'error').length,
      duplicate: records.filter(r => r.validation_status === 'duplicate').length
    };

    return {
      upload,
      records,
      summary
    };
  } catch (error) {
    console.error('Failed to get upload results:', error);
    throw error;
  }
}

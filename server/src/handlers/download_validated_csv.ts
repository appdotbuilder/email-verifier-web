
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type DownloadValidatedCsvInput, type DownloadCsvResponse } from '../schema';
import { eq } from 'drizzle-orm';

export async function downloadValidatedCsv(input: DownloadValidatedCsvInput): Promise<DownloadCsvResponse> {
  try {
    // Fetch upload record
    const uploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, input.upload_id))
      .execute();

    if (uploads.length === 0) {
      throw new Error(`Upload with ID ${input.upload_id} not found`);
    }

    const upload = uploads[0];

    // Fetch all email records for this upload, ordered by row number
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, input.upload_id))
      .orderBy(emailRecordsTable.row_number)
      .execute();

    if (emailRecords.length === 0) {
      throw new Error(`No email records found for upload ${input.upload_id}`);
    }

    // Parse additional data from first record to get original column names
    const firstRecord = emailRecords[0];
    let originalColumns: string[] = [];
    
    if (firstRecord.additional_data) {
      try {
        const additionalData = JSON.parse(firstRecord.additional_data);
        originalColumns = Object.keys(additionalData);
      } catch (error) {
        console.error('Failed to parse additional_data for column detection:', error);
        originalColumns = [];
      }
    }

    // Build CSV header - original columns + validation columns
    const validationColumns = ['validation_status', 'validation_result', 'validated_at'];
    const emailColumn = upload.email_column || 'email';
    
    // Ensure email column is included if not already in original columns
    const allOriginalColumns = originalColumns.includes(emailColumn) 
      ? originalColumns 
      : [...originalColumns, emailColumn];
    
    const csvHeaders = [...allOriginalColumns, ...validationColumns];

    // Helper function to escape CSV values
    const escapeCsvValue = (value: string | null | undefined): string => {
      if (value === null || value === undefined) {
        return '';
      }
      
      const stringValue = String(value);
      
      // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    };

    // Build CSV rows
    const csvRows = [csvHeaders.map(escapeCsvValue).join(',')];

    for (const record of emailRecords) {
      const row: string[] = [];
      
      // Add original column values
      let additionalData: Record<string, any> = {};
      if (record.additional_data) {
        try {
          additionalData = JSON.parse(record.additional_data);
        } catch (error) {
          console.error('Failed to parse additional_data for record:', record.id, error);
          // Continue with empty additionalData object
        }
      }

      // Add values for all original columns
      for (const column of allOriginalColumns) {
        if (column === emailColumn) {
          row.push(escapeCsvValue(record.email));
        } else {
          row.push(escapeCsvValue(additionalData[column]));
        }
      }

      // Add validation columns
      row.push(escapeCsvValue(record.validation_status));
      row.push(escapeCsvValue(record.validation_result));
      row.push(escapeCsvValue(record.validated_at?.toISOString()));

      csvRows.push(row.join(','));
    }

    // Generate CSV content
    const csvContent = csvRows.join('\n');
    const base64Content = Buffer.from(csvContent).toString('base64');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseFilename = upload.original_filename.replace(/\.csv$/i, '');
    const filename = `${baseFilename}_validated_${timestamp}.csv`;

    return {
      filename,
      content: base64Content,
      mime_type: 'text/csv'
    };
  } catch (error) {
    console.error('Download validated CSV failed:', error);
    throw error;
  }
}

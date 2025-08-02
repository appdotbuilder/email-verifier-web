
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type UploadCsvInput } from '../schema';
import { uploadCsv } from '../handlers/upload_csv';
import { eq } from 'drizzle-orm';

// Helper to create base64 CSV content
function createCSVContent(rows: string[]): string {
  const csvContent = rows.join('\n');
  return Buffer.from(csvContent, 'utf-8').toString('base64');
}

const basicCSV = createCSVContent([
  'name,email,age',
  'John Doe,john@example.com,30',
  'Jane Smith,jane@example.com,25'
]);

const testInput: UploadCsvInput = {
  filename: 'test.csv',
  content: basicCSV,
  email_column: 'email'
};

describe('uploadCsv', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should upload CSV with specified email column', async () => {
    const result = await uploadCsv(testInput);

    expect(result.filename).toEqual('test.csv');
    expect(result.total_rows).toEqual(2);
    expect(result.email_column).toEqual('email');
    expect(result.detected_columns).toEqual(['name', 'email', 'age']);
    expect(result.upload_id).toBeDefined();
  });

  it('should create upload record in database', async () => {
    const result = await uploadCsv(testInput);

    const uploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, result.upload_id))
      .execute();

    expect(uploads).toHaveLength(1);
    expect(uploads[0].filename).toEqual('test.csv');
    expect(uploads[0].original_filename).toEqual('test.csv');
    expect(uploads[0].total_rows).toEqual(2);
    expect(uploads[0].email_column).toEqual('email');
    expect(uploads[0].status).toEqual('uploaded');
    expect(uploads[0].file_size).toBeGreaterThan(0);
    expect(uploads[0].created_at).toBeInstanceOf(Date);
  });

  it('should create email records in database', async () => {
    const result = await uploadCsv(testInput);

    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, result.upload_id))
      .execute();

    expect(emailRecords).toHaveLength(2);
    
    // First record
    expect(emailRecords[0].row_number).toEqual(1);
    expect(emailRecords[0].email).toEqual('john@example.com');
    expect(emailRecords[0].validation_status).toBeNull();
    expect(emailRecords[0].validated_at).toBeNull();
    expect(emailRecords[0].created_at).toBeInstanceOf(Date);
    
    const additionalData1 = JSON.parse(emailRecords[0].additional_data || '{}');
    expect(additionalData1.name).toEqual('John Doe');
    expect(additionalData1.age).toEqual('30');
    expect(additionalData1.email).toBeUndefined(); // Email column excluded from additional data

    // Second record
    expect(emailRecords[1].row_number).toEqual(2);
    expect(emailRecords[1].email).toEqual('jane@example.com');
    
    const additionalData2 = JSON.parse(emailRecords[1].additional_data || '{}');
    expect(additionalData2.name).toEqual('Jane Smith');
    expect(additionalData2.age).toEqual('25');
  });

  it('should auto-detect email column when not specified', async () => {
    const inputWithoutEmailColumn: UploadCsvInput = {
      filename: 'test.csv',
      content: basicCSV
      // email_column not specified
    };

    const result = await uploadCsv(inputWithoutEmailColumn);

    expect(result.email_column).toEqual('email'); // Should auto-detect 'email' column
    expect(result.detected_columns).toEqual(['name', 'email', 'age']);
  });

  it('should handle CSV with quoted fields', async () => {
    const quotedCSV = createCSVContent([
      'name,email,description',
      '"John, Jr.",john@example.com,"Software Engineer, Senior"',
      'Jane Smith,jane@example.com,"Sales Manager"'
    ]);

    const input: UploadCsvInput = {
      filename: 'quoted.csv',
      content: quotedCSV,
      email_column: 'email'
    };

    const result = await uploadCsv(input);

    expect(result.total_rows).toEqual(2);
    
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, result.upload_id))
      .execute();

    const additionalData1 = JSON.parse(emailRecords[0].additional_data || '{}');
    expect(additionalData1.name).toEqual('John, Jr.');
    expect(additionalData1.description).toEqual('Software Engineer, Senior');
  });

  it('should fallback to first column when email column not found', async () => {
    const noEmailCSV = createCSVContent([
      'username,fullname,phone',
      'jdoe,John Doe,555-1234',
      'jsmith,Jane Smith,555-5678'  
    ]);

    const input: UploadCsvInput = {
      filename: 'no-email.csv',
      content: noEmailCSV
      // No email_column specified and no 'email' column exists
    };

    const result = await uploadCsv(input);

    expect(result.email_column).toEqual('username'); // Should fallback to first column
    expect(result.detected_columns).toEqual(['username', 'fullname', 'phone']);
    
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, result.upload_id))
      .execute();

    expect(emailRecords[0].email).toEqual('jdoe');
    expect(emailRecords[1].email).toEqual('jsmith');
  });

  it('should skip empty rows', async () => {
    const csvWithEmptyRows = createCSVContent([
      'name,email,age',
      'John Doe,john@example.com,30',
      ',,', // Empty row
      'Jane Smith,jane@example.com,25',
      '' // Another empty row
    ]);

    const input: UploadCsvInput = {
      filename: 'with-empty.csv',
      content: csvWithEmptyRows,
      email_column: 'email'
    };

    const result = await uploadCsv(input);

    expect(result.total_rows).toEqual(2); // Should only count non-empty rows
    
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, result.upload_id))
      .execute();

    expect(emailRecords).toHaveLength(2);
  });

  it('should throw error for invalid email column', async () => {
    const input: UploadCsvInput = {
      filename: 'test.csv',
      content: basicCSV,
      email_column: 'nonexistent_column'
    };

    await expect(uploadCsv(input)).rejects.toThrow(/Email column 'nonexistent_column' not found/i);
  });

  it('should throw error for CSV with only headers', async () => {
    const headersOnlyCSV = createCSVContent([
      'name,email,age'
      // No data rows
    ]);

    const input: UploadCsvInput = {
      filename: 'headers-only.csv',
      content: headersOnlyCSV,
      email_column: 'email'
    };

    await expect(uploadCsv(input)).rejects.toThrow(/must contain at least a header row and one data row/i);
  });

  it('should throw error for empty CSV', async () => {
    const input: UploadCsvInput = {
      filename: 'empty.csv',
      content: Buffer.from('', 'utf-8').toString('base64'),
      email_column: 'email'
    };

    await expect(uploadCsv(input)).rejects.toThrow(/must contain at least a header row and one data row/i);
  });
});

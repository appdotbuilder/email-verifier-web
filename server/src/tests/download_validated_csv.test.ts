
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type DownloadValidatedCsvInput } from '../schema';
import { downloadValidatedCsv } from '../handlers/download_validated_csv';

const testUploadInput = {
  filename: 'test_upload.csv',
  original_filename: 'contacts.csv',
  file_size: 1024,
  total_rows: 2,
  email_column: 'email_address',
  status: 'completed' as const
};

const testEmailRecords = [
  {
    upload_id: 1,
    row_number: 1,
    email: 'test1@example.com',
    validation_status: 'ok' as const,
    validation_result: '{"status":"ok","confidence":0.95}',
    additional_data: '{"name":"John Doe","company":"Acme Corp","email_address":"test1@example.com"}',
    validated_at: new Date('2024-01-01T10:00:00Z')
  },
  {
    upload_id: 1,
    row_number: 2,
    email: 'invalid@example.com',
    validation_status: 'invalid' as const,
    validation_result: '{"status":"invalid","reason":"syntax_error"}',
    additional_data: '{"name":"Jane Smith","company":"Test Inc","email_address":"invalid@example.com"}',
    validated_at: new Date('2024-01-01T10:01:00Z')
  }
];

describe('downloadValidatedCsv', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should download validated CSV with all columns', async () => {
    // Create upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values(testUploadInput)
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;

    // Create email records
    const emailRecordsWithUploadId = testEmailRecords.map(record => ({
      ...record,
      upload_id: uploadId
    }));

    await db.insert(emailRecordsTable)
      .values(emailRecordsWithUploadId)
      .execute();

    // Test the handler
    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    const result = await downloadValidatedCsv(input);

    // Verify response structure
    expect(result.filename).toBeDefined();
    expect(result.filename).toMatch(/contacts_validated_.*\.csv$/);
    expect(result.content).toBeDefined();
    expect(result.mime_type).toEqual('text/csv');

    // Decode and verify CSV content
    const csvContent = Buffer.from(result.content, 'base64').toString('utf-8');
    const csvLines = csvContent.split('\n');
    
    // Verify header
    expect(csvLines[0]).toEqual('name,company,email_address,validation_status,validation_result,validated_at');
    
    // Verify first data row
    expect(csvLines[1]).toEqual('John Doe,Acme Corp,test1@example.com,ok,"{""status"":""ok"",""confidence"":0.95}",2024-01-01T10:00:00.000Z');
    
    // Verify second data row
    expect(csvLines[2]).toEqual('Jane Smith,Test Inc,invalid@example.com,invalid,"{""status"":""invalid"",""reason"":""syntax_error""}",2024-01-01T10:01:00.000Z');
  });

  it('should handle CSV values with commas and quotes correctly', async () => {
    // Create upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values(testUploadInput)
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;

    // Create email record with special characters - proper JSON escaping
    await db.insert(emailRecordsTable)
      .values({
        upload_id: uploadId,
        row_number: 1,
        email: 'test@example.com',
        validation_status: 'ok',
        validation_result: '{"message":"Valid, but check domain"}',
        additional_data: '{"name":"John, Jr.","company":"Acme \\"Corp\\"","email_address":"test@example.com"}',
        validated_at: new Date('2024-01-01T10:00:00Z')
      })
      .execute();

    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    const result = await downloadValidatedCsv(input);

    const csvContent = Buffer.from(result.content, 'base64').toString('utf-8');
    const csvLines = csvContent.split('\n');
    
    // Verify that values with commas and quotes are properly escaped
    expect(csvLines[1]).toContain('"John, Jr."'); // Comma wrapped in quotes
    expect(csvLines[1]).toContain('"Acme ""Corp"""'); // Quotes escaped and wrapped
  });

  it('should handle records without additional data', async () => {
    // Create upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values({
        ...testUploadInput,
        email_column: 'email' // Different column name
      })
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;

    // Create email record without additional data
    await db.insert(emailRecordsTable)
      .values({
        upload_id: uploadId,
        row_number: 1,
        email: 'test@example.com',
        validation_status: 'ok',
        validation_result: null,
        additional_data: null,
        validated_at: null
      })
      .execute();

    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    const result = await downloadValidatedCsv(input);

    const csvContent = Buffer.from(result.content, 'base64').toString('utf-8');
    const csvLines = csvContent.split('\n');
    
    // Should have email column + validation columns
    expect(csvLines[0]).toEqual('email,validation_status,validation_result,validated_at');
    expect(csvLines[1]).toEqual('test@example.com,ok,,');
  });

  it('should throw error for non-existent upload', async () => {
    const input: DownloadValidatedCsvInput = { upload_id: 999 };
    
    await expect(downloadValidatedCsv(input)).rejects.toThrow(/Upload with ID 999 not found/);
  });

  it('should throw error for upload with no email records', async () => {
    // Create upload record without email records
    const uploadResult = await db.insert(csvUploadsTable)
      .values(testUploadInput)
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;
    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    
    await expect(downloadValidatedCsv(input)).rejects.toThrow(/No email records found for upload/);
  });

  it('should order records by row number', async () => {
    // Create upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values(testUploadInput)
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;

    // Create email records in reverse order
    await db.insert(emailRecordsTable)
      .values([
        {
          upload_id: uploadId,
          row_number: 3,
          email: 'third@example.com',
          validation_status: 'ok',
          validation_result: null,
          additional_data: '{"email_address":"third@example.com"}',
          validated_at: null
        },
        {
          upload_id: uploadId,
          row_number: 1,
          email: 'first@example.com',
          validation_status: 'ok',
          validation_result: null,
          additional_data: '{"email_address":"first@example.com"}',
          validated_at: null
        },
        {
          upload_id: uploadId,
          row_number: 2,
          email: 'second@example.com',
          validation_status: 'ok',
          validation_result: null,
          additional_data: '{"email_address":"second@example.com"}',
          validated_at: null
        }
      ])
      .execute();

    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    const result = await downloadValidatedCsv(input);

    const csvContent = Buffer.from(result.content, 'base64').toString('utf-8');
    const csvLines = csvContent.split('\n');
    
    // Verify records are in correct row order
    expect(csvLines[1]).toContain('first@example.com');
    expect(csvLines[2]).toContain('second@example.com');
    expect(csvLines[3]).toContain('third@example.com');
  });

  it('should handle malformed JSON in additional_data gracefully', async () => {
    // Create upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values(testUploadInput)
      .returning()
      .execute();
    
    const uploadId = uploadResult[0].id;

    // Create email record with malformed JSON
    await db.insert(emailRecordsTable)
      .values({
        upload_id: uploadId,
        row_number: 1,
        email: 'test@example.com',
        validation_status: 'ok',
        validation_result: null,
        additional_data: '{"name":"John","company":}', // Malformed JSON
        validated_at: null
      })
      .execute();

    const input: DownloadValidatedCsvInput = { upload_id: uploadId };
    const result = await downloadValidatedCsv(input);

    // Should still work, just with empty additional data
    expect(result.filename).toBeDefined();
    expect(result.content).toBeDefined();

    const csvContent = Buffer.from(result.content, 'base64').toString('utf-8');
    const csvLines = csvContent.split('\n');
    
    // Should have email column + validation columns (no original columns due to malformed JSON)
    expect(csvLines[0]).toEqual('email_address,validation_status,validation_result,validated_at');
    expect(csvLines[1]).toEqual('test@example.com,ok,,');
  });
});


import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type GetUploadResultsInput } from '../schema';
import { getUploadResults } from '../handlers/get_upload_results';

describe('getUploadResults', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return upload results with records and summary', async () => {
    // Create test upload
    const uploadResult = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1024,
        total_rows: 3,
        email_column: 'email',
        status: 'completed'
      })
      .returning()
      .execute();

    const uploadId = uploadResult[0].id;

    // Create test email records with various validation statuses
    await db.insert(emailRecordsTable)
      .values([
        {
          upload_id: uploadId,
          row_number: 1,
          email: 'valid@example.com',
          validation_status: 'ok',
          validation_result: '{"status": "ok"}',
          additional_data: '{"name": "John"}'
        },
        {
          upload_id: uploadId,
          row_number: 2,
          email: 'invalid@fake.com',
          validation_status: 'invalid',
          validation_result: '{"status": "invalid"}',
          additional_data: '{"name": "Jane"}'
        },
        {
          upload_id: uploadId,
          row_number: 3,
          email: 'pending@example.com',
          validation_status: null, // Not validated yet
          validation_result: null,
          additional_data: '{"name": "Bob"}'
        }
      ])
      .execute();

    const input: GetUploadResultsInput = {
      upload_id: uploadId
    };

    const result = await getUploadResults(input);

    // Verify upload data
    expect(result.upload.id).toEqual(uploadId);
    expect(result.upload.filename).toEqual('test.csv');
    expect(result.upload.original_filename).toEqual('test.csv');
    expect(result.upload.file_size).toEqual(1024);
    expect(result.upload.total_rows).toEqual(3);
    expect(result.upload.email_column).toEqual('email');
    expect(result.upload.status).toEqual('completed');
    expect(result.upload.created_at).toBeInstanceOf(Date);

    // Verify records
    expect(result.records).toHaveLength(3);
    
    const validRecord = result.records.find(r => r.email === 'valid@example.com');
    expect(validRecord).toBeDefined();
    expect(validRecord?.validation_status).toEqual('ok');
    expect(validRecord?.validation_result).toEqual('{"status": "ok"}');
    expect(validRecord?.additional_data).toEqual('{"name": "John"}');

    const invalidRecord = result.records.find(r => r.email === 'invalid@fake.com');
    expect(invalidRecord).toBeDefined();
    expect(invalidRecord?.validation_status).toEqual('invalid');

    const pendingRecord = result.records.find(r => r.email === 'pending@example.com');
    expect(pendingRecord).toBeDefined();
    expect(pendingRecord?.validation_status).toBeNull();

    // Verify summary statistics
    expect(result.summary.total).toEqual(3);
    expect(result.summary.validated).toEqual(2); // Two records have validation_status
    expect(result.summary.ok).toEqual(1);
    expect(result.summary.invalid).toEqual(1);
    expect(result.summary.disposable).toEqual(0);
    expect(result.summary.catch_all).toEqual(0);
    expect(result.summary.unknown).toEqual(0);
    expect(result.summary.error).toEqual(0);
    expect(result.summary.duplicate).toEqual(0);
  });

  it('should return empty results for upload with no records', async () => {
    // Create upload without any email records
    const uploadResult = await db.insert(csvUploadsTable)
      .values({
        filename: 'empty.csv',
        original_filename: 'empty.csv',
        file_size: 100,
        total_rows: 0,
        email_column: null,
        status: 'uploaded'
      })
      .returning()
      .execute();

    const input: GetUploadResultsInput = {
      upload_id: uploadResult[0].id
    };

    const result = await getUploadResults(input);

    expect(result.upload.id).toEqual(uploadResult[0].id);
    expect(result.records).toHaveLength(0);
    expect(result.summary.total).toEqual(0);
    expect(result.summary.validated).toEqual(0);
    expect(result.summary.ok).toEqual(0);
  });

  it('should calculate summary correctly with all validation statuses', async () => {
    // Create test upload
    const uploadResult = await db.insert(csvUploadsTable)
      .values({
        filename: 'all-statuses.csv',
        original_filename: 'all-statuses.csv',
        file_size: 2048,
        total_rows: 7,
        email_column: 'email',
        status: 'completed'
      })
      .returning()
      .execute();

    const uploadId = uploadResult[0].id;

    // Create records with all possible validation statuses
    await db.insert(emailRecordsTable)
      .values([
        { upload_id: uploadId, row_number: 1, email: 'ok@example.com', validation_status: 'ok' },
        { upload_id: uploadId, row_number: 2, email: 'invalid@fake.com', validation_status: 'invalid' },
        { upload_id: uploadId, row_number: 3, email: 'disposable@temp.com', validation_status: 'disposable' },
        { upload_id: uploadId, row_number: 4, email: 'catch@all.com', validation_status: 'catch_all' },
        { upload_id: uploadId, row_number: 5, email: 'unknown@mystery.com', validation_status: 'unknown' },
        { upload_id: uploadId, row_number: 6, email: 'error@failed.com', validation_status: 'error' },
        { upload_id: uploadId, row_number: 7, email: 'duplicate@same.com', validation_status: 'duplicate' }
      ])
      .execute();

    const input: GetUploadResultsInput = {
      upload_id: uploadId
    };

    const result = await getUploadResults(input);

    expect(result.summary.total).toEqual(7);
    expect(result.summary.validated).toEqual(7);
    expect(result.summary.ok).toEqual(1);
    expect(result.summary.invalid).toEqual(1);
    expect(result.summary.disposable).toEqual(1);
    expect(result.summary.catch_all).toEqual(1);
    expect(result.summary.unknown).toEqual(1);
    expect(result.summary.error).toEqual(1);
    expect(result.summary.duplicate).toEqual(1);
  });

  it('should throw error for non-existent upload', async () => {
    const input: GetUploadResultsInput = {
      upload_id: 99999
    };

    expect(getUploadResults(input)).rejects.toThrow(/Upload with id 99999 not found/i);
  });
});

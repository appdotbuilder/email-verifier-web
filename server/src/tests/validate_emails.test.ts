
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type ValidateEmailsInput } from '../schema';
import { validateEmails } from '../handlers/validate_emails';
import { eq } from 'drizzle-orm';

describe('validateEmails', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should start validation process for valid upload', async () => {
    // Create test upload
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 3,
        email_column: 'email',
        status: 'uploaded'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    // Create test email records
    await db.insert(emailRecordsTable)
      .values([
        {
          upload_id: uploadId,
          row_number: 1,
          email: 'test1@example.com',
          additional_data: JSON.stringify({ name: 'Test User 1' })
        },
        {
          upload_id: uploadId,
          row_number: 2,
          email: 'test2@example.com',
          additional_data: JSON.stringify({ name: 'Test User 2' })
        },
        {
          upload_id: uploadId,
          row_number: 3,
          email: 'invalid-email',
          additional_data: JSON.stringify({ name: 'Test User 3' })
        }
      ])
      .execute();

    const result = await validateEmails({ upload_id: uploadId });

    expect(result.message).toContain(`Email validation started for upload ${uploadId}`);
    expect(result.message).toContain('background');

    // Check that upload status was updated to processing
    const updatedUploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, uploadId))
      .execute();

    expect(updatedUploads[0].status).toEqual('processing');
  });

  it('should handle non-existent upload', async () => {
    await expect(validateEmails({ upload_id: 999 }))
      .rejects.toThrow(/upload.*999.*not found/i);
  });

  it('should handle upload already being processed', async () => {
    // Create upload with processing status
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 1,
        email_column: 'email',
        status: 'processing'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    await expect(validateEmails({ upload_id: uploadId }))
      .rejects.toThrow(/already being processed/i);
  });

  it('should handle already completed upload', async () => {
    // Create upload with completed status
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 1,
        email_column: 'email',
        status: 'completed'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    await expect(validateEmails({ upload_id: uploadId }))
      .rejects.toThrow(/already been validated/i);
  });

  it('should handle failed upload status', async () => {
    // Create upload with failed status
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 1,
        email_column: 'email',
        status: 'failed'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    await expect(validateEmails({ upload_id: uploadId }))
      .rejects.toThrow(/failed state.*cannot be processed/i);
  });

  it('should handle upload with no email records', async () => {
    // Create upload without email records
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'empty.csv',
        original_filename: 'empty.csv',
        file_size: 100,
        total_rows: 0,
        email_column: 'email',
        status: 'uploaded'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    const result = await validateEmails({ upload_id: uploadId });

    expect(result.message).toContain('No email records found');
    expect(result.message).toContain('marked as completed');

    // Check that upload was marked as completed
    const updatedUploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, uploadId))
      .execute();

    expect(updatedUploads[0].status).toEqual('completed');
    expect(updatedUploads[0].completed_at).toBeInstanceOf(Date);
  });

  it('should eventually validate emails in background', async () => {
    // Create test upload
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 2,
        email_column: 'email',
        status: 'uploaded'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    // Create test email records with different validation scenarios
    await db.insert(emailRecordsTable)
      .values([
        {
          upload_id: uploadId,
          row_number: 1,
          email: 'valid@example.com',
          additional_data: JSON.stringify({ name: 'Valid User' })
        },
        {
          upload_id: uploadId,
          row_number: 2,
          email: 'invalid-email',
          additional_data: JSON.stringify({ name: 'Invalid User' })
        }
      ])
      .execute();

    const result = await validateEmails({ upload_id: uploadId });

    expect(result.message).toContain(`Email validation started for upload ${uploadId}`);

    // Wait for background processing to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check that upload was eventually marked as completed
    const finalUploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, uploadId))
      .execute();

    expect(finalUploads[0].status).toEqual('completed');
    expect(finalUploads[0].completed_at).toBeInstanceOf(Date);

    // Check that email records were validated
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, uploadId))
      .execute();

    expect(emailRecords).toHaveLength(2);
    
    // Valid email should be marked as 'ok'
    const validRecord = emailRecords.find(r => r.email === 'valid@example.com');
    expect(validRecord?.validation_status).toEqual('ok');
    expect(validRecord?.validated_at).toBeInstanceOf(Date);
    expect(validRecord?.validation_result).toBeTruthy();

    // Invalid email should be marked as 'invalid'
    const invalidRecord = emailRecords.find(r => r.email === 'invalid-email');
    expect(invalidRecord?.validation_status).toEqual('invalid');
    expect(invalidRecord?.validated_at).toBeInstanceOf(Date);
    expect(invalidRecord?.validation_result).toBeTruthy();
  });

  it('should validate different email types correctly', async () => {
    // Create test upload
    const uploads = await db.insert(csvUploadsTable)
      .values({
        filename: 'test.csv',
        original_filename: 'test.csv',
        file_size: 1000,
        total_rows: 4,
        email_column: 'email',
        status: 'uploaded'
      })
      .returning()
      .execute();

    const uploadId = uploads[0].id;

    // Create test email records with different validation scenarios
    await db.insert(emailRecordsTable)
      .values([
        {
          upload_id: uploadId,
          row_number: 1,
          email: 'valid@example.com',
          additional_data: JSON.stringify({ name: 'Valid User' })
        },
        {
          upload_id: uploadId,
          row_number: 2,
          email: 'disposable@temp.com',
          additional_data: JSON.stringify({ name: 'Disposable User' })
        },
        {
          upload_id: uploadId,
          row_number: 3,
          email: 'test@catch_all.com',
          additional_data: JSON.stringify({ name: 'Catch All User' })
        },
        {
          upload_id: uploadId,
          row_number: 4,
          email: 'no-at-symbol',
          additional_data: JSON.stringify({ name: 'Invalid User' })
        }
      ])
      .execute();

    await validateEmails({ upload_id: uploadId });

    // Wait for background processing to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check email validation results
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, uploadId))
      .execute();

    expect(emailRecords).toHaveLength(4);

    // Check specific validation results
    const validRecord = emailRecords.find(r => r.email === 'valid@example.com');
    expect(validRecord?.validation_status).toEqual('ok');

    const disposableRecord = emailRecords.find(r => r.email === 'disposable@temp.com');
    expect(disposableRecord?.validation_status).toEqual('disposable');

    const catchAllRecord = emailRecords.find(r => r.email === 'test@catch_all.com');
    expect(catchAllRecord?.validation_status).toEqual('catch_all');

    const invalidRecord = emailRecords.find(r => r.email === 'no-at-symbol');
    expect(invalidRecord?.validation_status).toEqual('invalid');

    // All records should have validation results and timestamps
    emailRecords.forEach(record => {
      expect(record.validation_status).toBeTruthy();
      expect(record.validation_result).toBeTruthy();
      expect(record.validated_at).toBeInstanceOf(Date);
    });
  });
});

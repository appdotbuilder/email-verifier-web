
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { csvUploadsTable } from '../db/schema';
import { getUploads } from '../handlers/get_uploads';

describe('getUploads', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no uploads exist', async () => {
    const result = await getUploads();
    expect(result).toEqual([]);
  });

  it('should return all uploads ordered by created_at DESC', async () => {
    // Create test uploads with different timestamps
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Insert uploads in non-chronological order
    await db.insert(csvUploadsTable).values([
      {
        filename: 'upload1.csv',
        original_filename: 'original1.csv',
        file_size: 1000,
        total_rows: 100,
        email_column: 'email',
        status: 'uploaded',
        created_at: twoDaysAgo
      },
      {
        filename: 'upload2.csv',
        original_filename: 'original2.csv',
        file_size: 2000,
        total_rows: 200,
        email_column: 'email_address',
        status: 'processing',
        created_at: now
      },
      {
        filename: 'upload3.csv',
        original_filename: 'original3.csv',
        file_size: 1500,
        total_rows: 150,
        email_column: null,
        status: 'completed',
        created_at: yesterday
      }
    ]).execute();

    const result = await getUploads();

    expect(result).toHaveLength(3);
    
    // Verify they are ordered by created_at DESC (most recent first)
    expect(result[0].filename).toEqual('upload2.csv');
    expect(result[0].status).toEqual('processing');
    expect(result[1].filename).toEqual('upload3.csv');
    expect(result[1].status).toEqual('completed');
    expect(result[2].filename).toEqual('upload1.csv');
    expect(result[2].status).toEqual('uploaded');

    // Verify all fields are present
    expect(result[0].id).toBeDefined();
    expect(result[0].original_filename).toEqual('original2.csv');
    expect(result[0].file_size).toEqual(2000);
    expect(result[0].total_rows).toEqual(200);
    expect(result[0].email_column).toEqual('email_address');
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].completed_at).toBeNull();
  });

  it('should handle uploads with nullable fields', async () => {
    await db.insert(csvUploadsTable).values({
      filename: 'test.csv',
      original_filename: 'test_original.csv',
      file_size: 500,
      total_rows: 50,
      email_column: null, // Nullable field
      status: 'failed',
      completed_at: null // Nullable field
    }).execute();

    const result = await getUploads();

    expect(result).toHaveLength(1);
    expect(result[0].email_column).toBeNull();
    expect(result[0].completed_at).toBeNull();
    expect(result[0].status).toEqual('failed');
  });

  it('should handle uploads with completed_at timestamp', async () => {
    const completedAt = new Date();
    
    await db.insert(csvUploadsTable).values({
      filename: 'completed.csv',
      original_filename: 'completed_original.csv',
      file_size: 3000,
      total_rows: 300,
      email_column: 'email',
      status: 'completed',
      completed_at: completedAt
    }).execute();

    const result = await getUploads();

    expect(result).toHaveLength(1);
    expect(result[0].status).toEqual('completed');
    expect(result[0].completed_at).toBeInstanceOf(Date);
    expect(result[0].completed_at?.getTime()).toEqual(completedAt.getTime());
  });
});


import { db } from '../db';
import { csvUploadsTable } from '../db/schema';
import { type CsvUpload } from '../schema';
import { desc } from 'drizzle-orm';

export async function getUploads(): Promise<CsvUpload[]> {
  try {
    const results = await db.select()
      .from(csvUploadsTable)
      .orderBy(desc(csvUploadsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch uploads:', error);
    throw error;
  }
}

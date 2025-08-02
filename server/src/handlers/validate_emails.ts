
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type ValidateEmailsInput } from '../schema';
import { eq } from 'drizzle-orm';

export async function validateEmails(input: ValidateEmailsInput): Promise<{ message: string }> {
  try {
    // First, verify the upload exists
    const uploads = await db.select()
      .from(csvUploadsTable)
      .where(eq(csvUploadsTable.id, input.upload_id))
      .execute();

    if (uploads.length === 0) {
      throw new Error(`Upload with id ${input.upload_id} not found`);
    }

    const upload = uploads[0];

    // Check if upload is in a valid state for validation
    if (upload.status === 'processing') {
      throw new Error('Upload is already being processed');
    }

    if (upload.status === 'completed') {
      throw new Error('Upload has already been validated');
    }

    if (upload.status === 'failed') {
      throw new Error('Upload is in failed state and cannot be processed');
    }

    // Update upload status to processing
    await db.update(csvUploadsTable)
      .set({ status: 'processing' })
      .where(eq(csvUploadsTable.id, input.upload_id))
      .execute();

    // Get all email records for this upload
    const emailRecords = await db.select()
      .from(emailRecordsTable)
      .where(eq(emailRecordsTable.upload_id, input.upload_id))
      .execute();

    if (emailRecords.length === 0) {
      // No email records found - mark as completed
      await db.update(csvUploadsTable)
        .set({ 
          status: 'completed',
          completed_at: new Date()
        })
        .where(eq(csvUploadsTable.id, input.upload_id))
        .execute();

      return {
        message: `No email records found for upload ${input.upload_id}. Upload marked as completed.`
      };
    }

    // Start background validation process
    // Use setImmediate to ensure it runs after the current execution context
    setImmediate(() => {
      validateEmailsBackground(input.upload_id, emailRecords).catch(error => {
        console.error('Background validation failed:', error);
      });
    });

    return {
      message: `Email validation started for upload ${input.upload_id}. This process will run in the background.`
    };
  } catch (error) {
    console.error('Email validation failed:', error);
    throw error;
  }
}

// Background validation function
async function validateEmailsBackground(uploadId: number, emailRecords: any[]) {
  try {
    const now = new Date();
    
    // Process each email record
    for (const record of emailRecords) {
      // Skip already validated records
      if (record.validation_status) {
        continue;
      }

      // Simulate MillionVerifier API call
      const validationResult = await simulateMillionVerifierAPI(record.email);
      
      // Update email record with validation results
      await db.update(emailRecordsTable)
        .set({
          validation_status: validationResult.status,
          validation_result: JSON.stringify(validationResult),
          validated_at: now
        })
        .where(eq(emailRecordsTable.id, record.id))
        .execute();
    }

    // Mark upload as completed
    await db.update(csvUploadsTable)
      .set({ 
        status: 'completed',
        completed_at: now
      })
      .where(eq(csvUploadsTable.id, uploadId))
      .execute();

  } catch (error) {
    console.error('Background validation failed:', error);
    
    try {
      // Mark upload as failed
      await db.update(csvUploadsTable)
        .set({ 
          status: 'failed',
          completed_at: new Date()
        })
        .where(eq(csvUploadsTable.id, uploadId))
        .execute();
    } catch (updateError) {
      // Ignore update errors if tables don't exist (during test cleanup)
      console.error('Failed to update upload status:', updateError);
    }
  }
}

// Simulate MillionVerifier API response
async function simulateMillionVerifierAPI(email: string) {
  // Add small delay to simulate API call
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Simple email validation logic for simulation
  if (!email.includes('@')) {
    return {
      status: 'invalid' as const,
      resultcode: 2,
      result: 'invalid',
      credits: 99,
      executiontime: 0.1
    };
  }

  if (email.includes('disposable') || email.includes('temp')) {
    return {
      status: 'disposable' as const,
      resultcode: 4,
      result: 'disposable',
      credits: 99,
      executiontime: 0.1
    };
  }

  if (email.includes('catch_all')) {
    return {
      status: 'catch_all' as const,
      resultcode: 3,
      result: 'catch_all',
      credits: 99,
      executiontime: 0.1
    };
  }

  // Default to valid email
  return {
    status: 'ok' as const,
    resultcode: 1,
    result: 'ok',
    credits: 99,
    executiontime: 0.1
  };
}

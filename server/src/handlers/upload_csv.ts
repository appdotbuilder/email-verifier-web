
import { db } from '../db';
import { csvUploadsTable, emailRecordsTable } from '../db/schema';
import { type UploadCsvInput, type UploadResponse } from '../schema';

export async function uploadCsv(input: UploadCsvInput): Promise<UploadResponse> {
  try {
    // Decode base64 content
    const csvContent = Buffer.from(input.content, 'base64').toString('utf-8');
    
    // Parse CSV lines
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header row and one data row');
    }
    
    // Parse headers
    const headerLine = lines[0];
    const headers = parseCSVRow(headerLine);
    
    if (headers.length === 0) {
      throw new Error('CSV must contain at least one column');
    }
    
    // Auto-detect email column if not provided
    let emailColumn = input.email_column;
    if (!emailColumn) {
      emailColumn = headers.find(h => 
        h.toLowerCase().includes('email') || 
        h.toLowerCase().includes('mail')
      ) || headers[0]; // Fallback to first column
    }
    
    // Validate email column exists
    if (!headers.includes(emailColumn)) {
      throw new Error(`Email column '${emailColumn}' not found in CSV headers`);
    }
    
    const emailColumnIndex = headers.indexOf(emailColumn);
    const totalRows = lines.length - 1; // Exclude header row
    
    // Calculate file size
    const fileSize = Buffer.byteLength(csvContent, 'utf-8');
    
    // Insert upload record
    const uploadResult = await db.insert(csvUploadsTable)
      .values({
        filename: input.filename,
        original_filename: input.filename,
        file_size: fileSize,
        total_rows: totalRows,
        email_column: emailColumn,
        status: 'uploaded'
      })
      .returning()
      .execute();
    
    const upload = uploadResult[0];
    
    // Parse and insert email records
    const emailRecords = [];
    for (let i = 1; i < lines.length; i++) {
      const rowData = parseCSVRow(lines[i]);
      
      // Skip empty rows
      if (rowData.every(cell => cell.trim() === '')) {
        continue;
      }
      
      const email = rowData[emailColumnIndex] || '';
      
      // Create additional data object (all columns except email)
      const additionalData: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (index !== emailColumnIndex) {
          additionalData[header] = rowData[index] || '';
        }
      });
      
      emailRecords.push({
        upload_id: upload.id,
        row_number: i, // 1-based row number (excluding header)
        email: email.trim(),
        additional_data: JSON.stringify(additionalData)
      });
    }
    
    // Batch insert email records
    if (emailRecords.length > 0) {
      await db.insert(emailRecordsTable)
        .values(emailRecords)
        .execute();
    }
    
    return {
      upload_id: upload.id,
      filename: input.filename,
      total_rows: emailRecords.length, // Actual number of non-empty rows processed
      email_column: emailColumn,
      detected_columns: headers
    };
  } catch (error) {
    console.error('CSV upload failed:', error);
    throw error;
  }
}

// Helper function to parse CSV row handling quoted fields
function parseCSVRow(row: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < row.length) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(current);
  
  return result.map(field => field.trim());
}

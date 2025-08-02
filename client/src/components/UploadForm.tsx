
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { UploadResponse } from '../../../server/src/schema';

interface UploadFormProps {
  onUploadSuccess: (uploadId: number) => void;
}

export function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [emailColumn, setEmailColumn] = useState<string>('');
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setUploadResponse(null);
      setDetectedColumns([]);
      setEmailColumn('');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:application/... prefix to get just the base64 content
        const base64Content = result.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const base64Content = await fileToBase64(file);
      
      const response = await trpc.uploadCsv.mutate({
        filename: file.name,
        content: base64Content,
        email_column: emailColumn || undefined
      });

      setUploadResponse(response);
      setDetectedColumns(response.detected_columns);
      
      // If no email column was specified and we detected one, show the selection
      if (!emailColumn && response.detected_columns.length > 0) {
        return; // Let user confirm email column
      }

      onUploadSuccess(response.upload_id);
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmUpload = () => {
    if (uploadResponse) {
      onUploadSuccess(uploadResponse.upload_id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid w-full items-center gap-2">
        <Label htmlFor="csv-file">CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="cursor-pointer"
        />
      </div>

      {file && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <span>📄</span>
              <span><strong>File:</strong> {file.name}</span>
              <span><strong>Size:</strong> {(file.size / 1024).toFixed(1)} KB</span>
            </div>
          </CardContent>
        </Card>
      )}

      {detectedColumns.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="email-column">Email Column</Label>
          <Select value={emailColumn} onValueChange={setEmailColumn}>
            <SelectTrigger>
              <SelectValue placeholder="Select the column containing email addresses" />
            </SelectTrigger>
            <SelectContent>
              {detectedColumns.map((column: string) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-600">
            Detected columns: {detectedColumns.join(', ')}
          </p>
        </div>
      )}

      {uploadResponse && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-700">
            ✅ File uploaded successfully! Found {uploadResponse.total_rows} rows
            {uploadResponse.email_column && ` with emails in "${uploadResponse.email_column}" column`}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-700">
            ❌ {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {!uploadResponse ? (
          <Button 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            className="flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Uploading...
              </>
            ) : (
              <>
                📤 Upload CSV
              </>
            )}
          </Button>
        ) : (
          <Button 
            onClick={handleConfirmUpload}
            className="flex items-center gap-2"
          >
            ✨ Continue to Validation
          </Button>
        )}
      </div>
    </div>
  );
}

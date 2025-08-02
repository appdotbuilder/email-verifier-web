
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/utils/trpc';
import type { ValidationResultsResponse, EmailRecord, EmailValidationStatus } from '../../../server/src/schema';

interface ValidationResultsProps {
  results: ValidationResultsResponse;
  onValidateEmails: (uploadId: number) => void;
  isLoading: boolean;
}

export function ValidationResults({ results, onValidateEmails, isLoading }: ValidationResultsProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const getStatusBadge = (status: EmailValidationStatus | null) => {
    if (!status) {
      return <Badge variant="secondary">⏳ Pending</Badge>;
    }

    const statusConfig = {
      ok: { variant: 'default' as const, icon: '✅', label: 'Valid' },
      invalid: { variant: 'destructive' as const, icon: '❌', label: 'Invalid' },
      disposable: { variant: 'destructive' as const, icon: '🗑️', label: 'Disposable' },
      catch_all: { variant: 'secondary' as const, icon: '📧', label: 'Catch-all' },
      unknown: { variant: 'secondary' as const, icon: '❓', label: 'Unknown' },
      error: { variant: 'destructive' as const, icon: '⚠️', label: 'Error' },
      duplicate: { variant: 'destructive' as const, icon: '🔄', label: 'Duplicate' }
    };

    const config = statusConfig[status];
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <span>{config.icon}</span>
        {config.label}
      </Badge>
    );
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await trpc.downloadValidatedCsv.query({
        upload_id: results.upload.id
      });

      // Create blob and download
      const content = atob(response.content);
      const blob = new Blob([content], { type: response.mime_type });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const progressPercentage = results.summary.total > 0 
    ? (results.summary.validated / results.summary.total) * 100 
    : 0;

  const parseAdditionalData = (additionalData: string | null) => {
    if (!additionalData) return {};
    try {
      return JSON.parse(additionalData);
    } catch {
      return {};
    }
  };

  // Get additional columns from the first record
  const additionalColumns = results.records.length > 0 
    ? Object.keys(parseAdditionalData(results.records[0].additional_data))
    : [];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              📊 Validation Results: {results.upload.original_filename}
            </span>
            <div className="flex items-center gap-2">
              {results.upload.status === 'uploaded' && (
                <Button
                  onClick={() => onValidateEmails(results.upload.id)}
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Validating...
                    </>
                  ) : (
                    <>
                      🔍 Start Validation
                    </>
                  )}
                </Button>
              )}
              {results.upload.status === 'completed' && (
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      💾 Download CSV
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            File uploaded on {results.upload.created_at.toLocaleDateString()} • 
            {results.upload.total_rows.toLocaleString()} total rows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Validation Progress</span>
                <span>{results.summary.validated} / {results.summary.total}</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {results.summary.ok}
                </div>
                <div className="text-sm text-green-600">✅ Valid</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {results.summary.invalid}
                </div>
                <div className="text-sm text-red-600">❌ Invalid</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {results.summary.disposable}
                </div>
                <div className="text-sm text-yellow-600">🗑️ Disposable</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">
                  {results.summary.unknown + results.summary.catch_all}
                </div>
                <div className="text-sm text-gray-600">❓ Other</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Email Records</CardTitle>
          <CardDescription>
            Detailed validation results for each email address
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.records.length === 0 ? (
            <Alert>
              <AlertDescription>
                No email records found. Try uploading a CSV file with email addresses.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    {additionalColumns.map((column: string) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                    <TableHead>Validated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.records.map((record: EmailRecord) => {
                    const additionalData = parseAdditionalData(record.additional_data);
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-xs">
                          {record.row_number}
                        </TableCell>
                        <TableCell className="font-mono">
                          {record.email}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(record.validation_status)}
                        </TableCell>
                        {additionalColumns.map((column: string) => (
                          <TableCell key={column}>
                            {additionalData[column] || '-'}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs text-gray-500">
                          {record.validated_at ? record.validated_at.toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CsvUpload } from '../../../server/src/schema';

interface UploadsTableProps {
  uploads: CsvUpload[];
  onViewResults: (uploadId: number) => void;
  onValidateEmails: (uploadId: number) => void;
  isLoading: boolean;
}

export function UploadsTable({ uploads, onViewResults, onValidateEmails, isLoading }: UploadsTableProps) {
  const getStatusBadge = (status: CsvUpload['status']) => {
    const statusConfig = {
      uploaded: { variant: 'secondary' as const, icon: '📤', label: 'Uploaded' },
      processing: { variant: 'default' as const, icon: '⏳', label: 'Processing' },
      completed: { variant: 'default' as const, icon: '✅', label: 'Completed' },
      failed: { variant: 'destructive' as const, icon: '❌', label: 'Failed' }
    };

    const config = statusConfig[status];
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <span>{config.icon}</span>
        {config.label}
      </Badge>
    );
  };

  if (uploads.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">📭</div>
        <p>No uploads yet. Upload your first CSV file above!</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Email Column</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploads.map((upload: CsvUpload) => (
            <TableRow key={upload.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>📄</span>
                  <div>
                    <div>{upload.original_filename}</div>
                    <div className="text-xs text-gray-500">
                      {(upload.file_size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{upload.total_rows.toLocaleString()}</TableCell>
              <TableCell>
                {upload.email_column ? (
                  <code className="px-2 py-1 bg-gray-100 rounded text-xs">
                    {upload.email_column}
                  </code>
                ) : (
                  <span className="text-gray-400">Not set</span>
                )}
              </TableCell>
              <TableCell>
                {getStatusBadge(upload.status)}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {upload.created_at.toLocaleDateString()} {upload.created_at.toLocaleTimeString()}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  {upload.status === 'uploaded' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onValidateEmails(upload.id)}
                      disabled={isLoading}
                      className="flex items-center gap-1"
                    >
                      <span>🔍</span>
                      Validate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewResults(upload.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1"
                  >
                    <span>👁️</span>
                    View
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

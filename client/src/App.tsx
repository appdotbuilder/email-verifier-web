
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/utils/trpc';
import { UploadForm } from '@/components/UploadForm';
import { UploadsTable } from '@/components/UploadsTable';
import { ValidationResults } from '@/components/ValidationResults';
import type { CsvUpload, ValidationResultsResponse } from '../../server/src/schema';

function App() {
  const [uploads, setUploads] = useState<CsvUpload[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<number | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResultsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload');
  const [isLoading, setIsLoading] = useState(false);

  const loadUploads = useCallback(async () => {
    try {
      const result = await trpc.getUploads.query();
      setUploads(result);
    } catch (error) {
      console.error('Failed to load uploads:', error);
    }
  }, []);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  const handleUploadSuccess = useCallback((uploadId: number) => {
    loadUploads();
    setSelectedUpload(uploadId);
    setActiveTab('results');
  }, [loadUploads]);

  const handleViewResults = useCallback(async (uploadId: number) => {
    setIsLoading(true);
    try {
      const results = await trpc.getUploadResults.query({ upload_id: uploadId });
      setValidationResults(results);
      setSelectedUpload(uploadId);
      setActiveTab('results');
    } catch (error) {
      console.error('Failed to load validation results:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleValidateEmails = useCallback(async (uploadId: number) => {
    setIsLoading(true);
    try {
      await trpc.validateEmails.mutate({ upload_id: uploadId });
      // Refresh the results after validation
      await handleViewResults(uploadId);
      loadUploads(); // Refresh uploads list to show updated status
    } catch (error) {
      console.error('Failed to validate emails:', error);
    } finally {
      setIsLoading(false);
    }
  }, [handleViewResults, loadUploads]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            📧 Email Validator Pro
          </h1>
          <p className="text-lg text-gray-600">
            Upload CSV files and validate email addresses with MillionVerifier API
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'upload' | 'results')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              📤 Upload & Manage
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!selectedUpload}>
              📊 Validation Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  📋 Upload CSV File
                </CardTitle>
                <CardDescription>
                  Upload a CSV file containing email addresses for validation. 
                  The system will auto-detect the email column or you can specify it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadForm onUploadSuccess={handleUploadSuccess} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  📁 Your Uploads
                </CardTitle>
                <CardDescription>
                  Manage your uploaded files and view validation results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UploadsTable 
                  uploads={uploads}
                  onViewResults={handleViewResults}
                  onValidateEmails={handleValidateEmails}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            {validationResults ? (
              <ValidationResults 
                results={validationResults}
                onValidateEmails={handleValidateEmails}
                isLoading={isLoading}
              />
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-gray-500">
                    Select an upload from the Upload & Manage tab to view results
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;


import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import { 
  uploadCsvInputSchema, 
  validateEmailsInputSchema,
  getUploadResultsInputSchema,
  downloadValidatedCsvInputSchema
} from './schema';

// Import handlers
import { uploadCsv } from './handlers/upload_csv';
import { validateEmails } from './handlers/validate_emails';
import { getUploadResults } from './handlers/get_upload_results';
import { downloadValidatedCsv } from './handlers/download_validated_csv';
import { getUploads } from './handlers/get_uploads';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),
  
  // Upload CSV file and parse email addresses
  uploadCsv: publicProcedure
    .input(uploadCsvInputSchema)
    .mutation(({ input }) => uploadCsv(input)),
  
  // Start email validation process using MillionVerifier API
  validateEmails: publicProcedure
    .input(validateEmailsInputSchema)
    .mutation(({ input }) => validateEmails(input)),
  
  // Get validation results for a specific upload
  getUploadResults: publicProcedure
    .input(getUploadResultsInputSchema)
    .query(({ input }) => getUploadResults(input)),
  
  // Download validated CSV with enriched data
  downloadValidatedCsv: publicProcedure
    .input(downloadValidatedCsvInputSchema)
    .query(({ input }) => downloadValidatedCsv(input)),
  
  // Get list of all uploads
  getUploads: publicProcedure
    .query(() => getUploads()),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();

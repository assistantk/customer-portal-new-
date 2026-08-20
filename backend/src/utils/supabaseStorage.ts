import { env } from '../config/env.js';

export interface StoredGstinDocument {
  bucket: string;
  path: string;
  contentType: string;
}

const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
let bucketReady = false;

const storageBaseUrl = () => env.SUPABASE_URL.replace(/\/+$/, '');

const storageHeaders = (contentType = 'application/json') => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': contentType,
});

const sanitizeSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document';

const ensureBucket = async (): Promise<void> => {
  if (!configured || bucketReady) return;

  const bucket = env.SUPABASE_GSTIN_BUCKET;
  const createResp = await fetch(`${storageBaseUrl()}/storage/v1/bucket`, {
    method: 'POST',
    headers: storageHeaders(),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ['application/pdf'],
    }),
  });

  if (!createResp.ok && createResp.status !== 409) {
    const message = await createResp.text();
    throw new Error(`Unable to prepare Supabase GSTIN bucket: ${message}`);
  }

  bucketReady = true;
};

export const uploadGstinPdf = async ({
  customerCode,
  gstinNumber,
  fileName,
  fileBuffer,
}: {
  customerCode: string;
  gstinNumber: string;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<StoredGstinDocument | null> => {
  if (!configured) return null;

  await ensureBucket();

  const bucket = env.SUPABASE_GSTIN_BUCKET;
  const cleanCustomer = sanitizeSegment(customerCode.toUpperCase());
  const cleanGstin = sanitizeSegment(gstinNumber.toUpperCase());
  const cleanName = sanitizeSegment(fileName.replace(/\.pdf$/i, ''));
  const path = `${cleanCustomer}/${cleanGstin}/${Date.now()}-${cleanName}.pdf`;

  const uploadResp = await fetch(
    `${storageBaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,
    {
      method: 'PUT',
      headers: {
        ...storageHeaders('application/pdf'),
        'x-upsert': 'true',
      },
      body: fileBuffer as any,
    }
  );

  if (!uploadResp.ok) {
    const message = await uploadResp.text();
    throw new Error(`Unable to upload GSTIN PDF to Supabase: ${message}`);
  }

  return {
    bucket,
    path,
    contentType: 'application/pdf',
  };
};

export const downloadGstinPdf = async (path: string): Promise<Buffer | null> => {
  if (!configured || !path.trim()) return null;

  const resp = await fetch(
    `${storageBaseUrl()}/storage/v1/object/${encodeURIComponent(env.SUPABASE_GSTIN_BUCKET)}/${path}`,
    {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!resp.ok) {
    const message = await resp.text();
    throw new Error(`Unable to fetch GSTIN PDF from Supabase: ${message}`);
  }

  return Buffer.from(await resp.arrayBuffer());
};

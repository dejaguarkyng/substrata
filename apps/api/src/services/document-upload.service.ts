import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getLocalStorageRoot, repoRoot } from '../lib/paths';
import { HttpError } from '../lib/errors';

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

export async function persistUploadedDocument(input: {
  file: Express.Multer.File;
}) {
  if (!input.file.buffer?.length) {
    throw new HttpError(400, 'Uploaded file is empty.');
  }

  const safeFileName = sanitizeFileName(input.file.originalname || 'upload.bin');
  const storagePath = path.join(
    'documents',
    new Date().toISOString().slice(0, 10),
    `${randomUUID()}-${safeFileName}`,
  );
  const absolutePath = path.join(getLocalStorageRoot(), storagePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, input.file.buffer);

  return {
    storagePath,
    absolutePath,
    fileName: input.file.originalname,
    mimeType: input.file.mimetype || 'application/octet-stream',
    sizeBytes: input.file.size,
    sha256: createHash('sha256').update(input.file.buffer).digest('hex'),
  };
}

export async function loadBundledSampleDatasheet() {
  const relativePath = path.join(
    'workers',
    'classifier',
    'samples',
    'public-semiconductor-demo-datasheet.txt',
  );
  const absolutePath = path.join(repoRoot, relativePath);
  const rawText = await fs.readFile(absolutePath, 'utf8');

  return {
    title: 'Asteria A112 Edge Accelerator Public Demo Datasheet',
    fileName: 'public-semiconductor-demo-datasheet.txt',
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(rawText, 'utf8'),
    storagePath: relativePath,
    documentType: 'Public technical datasheet',
    manufacturer: 'Asteria Microsystems',
    sourceUrl: 'https://example.com/public-demo/asteria-a112-datasheet',
    versionLabel: 'Rev. 2.3',
    extractionStatus: 'completed' as const,
    origin: 'public' as const,
    visibility: 'organization' as const,
    rawText,
    sourceType: 'seed' as const,
  };
}

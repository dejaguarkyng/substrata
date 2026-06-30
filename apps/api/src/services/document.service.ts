import { prisma } from '@substrata/db';

export async function createDocument(
  organizationId: string,
  input: {
    title: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
    sizeBytes?: number;
    rawText?: string;
    sourceType: 'upload' | 'seed' | 'manual';
    documentType?: string;
    manufacturer?: string;
    sourceUrl?: string;
    versionLabel?: string;
    sha256?: string;
    pageCount?: number;
    extractionStatus?: 'pending' | 'completed' | 'failed';
    origin?: 'public' | 'customer_provided' | 'internal';
    visibility?: 'private' | 'organization' | 'public_demo';
  },
) {
  return prisma.document.create({
    data: {
      organizationId,
      title: input.title,
      fileName: input.fileName,
      displayFileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      rawText: input.rawText,
      sourceType: input.sourceType,
      documentType: input.documentType || null,
      manufacturer: input.manufacturer || null,
      sourceUrl: input.sourceUrl || null,
      versionLabel: input.versionLabel || null,
      sha256: input.sha256 || null,
      pageCount: input.pageCount ?? null,
      extractionStatus: input.extractionStatus ?? 'completed',
      origin: input.origin ?? 'customer_provided',
      visibility: input.visibility ?? 'private',
    },
  });
}

export async function listDocuments(organizationId: string) {
  return prisma.document.findMany({
    where: { organizationId },
    include: {
      classificationRuns: {
        orderBy: { createdAt: 'desc' },
        include: {
          reviewMemo: true,
          humanReviews: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDocument(organizationId: string, id: string) {
  return prisma.document.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      classificationRuns: {
        orderBy: { createdAt: 'desc' },
        include: {
          extractedSpecs: true,
          factIssues: true,
          reviewPaths: {
            include: {
              facts: {
                include: {
                  extractedSpec: true,
                },
              },
              citations: {
                include: {
                  regulationSource: true,
                },
              },
            },
          },
          eccnCandidates: {
            include: {
              citations: {
                include: {
                  regulationSource: true,
                },
              },
              regulationSource: true,
              factMappings: {
                include: {
                  extractedSpec: true,
                },
              },
            },
          },
          citations: true,
          reviewMemo: true,
          reviewMemoVersions: true,
          humanReviews: true,
          reviewerActions: true,
        },
      },
      organization: true,
    },
  });
}

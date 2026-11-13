export const r2Keys = {
  sourceDocument: (sourceCode: string, year: number, sha256: string, ext: string): string => `sources/${sourceCode}/${year}/${sha256}.${ext}`,
  derivedCrop: (sourceDocumentId: string, questionNumber: string, n: number): string => `derived/${sourceDocumentId}/crops/q${questionNumber}-${n}.png`,
  publicAsset: (sha256: string, ext: string): string => `assets/${sha256.slice(0, 2)}/${sha256}.${ext}`,
  userUpload: (userId: string, yyyyMm: string, id: string, ext: string): string => `u/${userId}/${yyyyMm}/${id}.${ext}`,
  backup: (date: string): string => `backups/${date}/db.sql.gz`,
} as const;

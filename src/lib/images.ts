export type ImageDimensions = {
  height: number;
  width: number;
};

export const COMPRESSIBLE_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type CompressibleImageMimeType =
  (typeof COMPRESSIBLE_IMAGE_MIME_TYPES)[number];

export function isCompressibleImageMimeType(
  mimeType: string | null | undefined,
): mimeType is CompressibleImageMimeType {
  return COMPRESSIBLE_IMAGE_MIME_TYPES.includes(
    normalizeMimeType(mimeType) as CompressibleImageMimeType,
  );
}

export function calculateContainedImageSize({
  maxHeight,
  maxWidth,
  sourceHeight,
  sourceWidth,
}: {
  maxHeight: number;
  maxWidth: number;
  sourceHeight: number;
  sourceWidth: number;
}): ImageDimensions {
  if (
    sourceHeight <= 0 ||
    sourceWidth <= 0 ||
    maxHeight <= 0 ||
    maxWidth <= 0
  ) {
    return { height: 0, width: 0 };
  }

  const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);

  return {
    height: Math.max(1, Math.round(sourceHeight * ratio)),
    width: Math.max(1, Math.round(sourceWidth * ratio)),
  };
}

export function getCompressedImageMimeType(
  originalMimeType: string | null | undefined,
): CompressibleImageMimeType {
  const normalized = normalizeMimeType(originalMimeType);

  return normalized === "image/png" ? "image/png" : "image/jpeg";
}

export function getThumbnailFileName(originalFileName: string): string {
  const stem = originalFileName.replace(/\.[^.]+$/, "") || "thumbnail";

  return `${stem}-thumbnail.jpg`;
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").toLowerCase().split(";")[0].trim();
}

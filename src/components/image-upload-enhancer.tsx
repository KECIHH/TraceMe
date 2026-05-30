"use client";

import { useRef, useState } from "react";

import {
  calculateContainedImageSize,
  getCompressedImageMimeType,
  getThumbnailFileName,
  isCompressibleImageMimeType,
} from "@/lib/images";

const MAX_IMAGE_WIDTH = 1800;
const MAX_IMAGE_HEIGHT = 1800;
const THUMBNAIL_SIZE = 480;
const JPEG_QUALITY = 0.78;

export function ImageUploadEnhancer({
  accept,
  className,
}: {
  accept: string;
  className: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const compressedFlagRef = useRef<HTMLInputElement>(null);
  const [preserveOriginal, setPreserveOriginal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  async function handleChange() {
    const file = fileInputRef.current?.files?.[0];

    setStatus("");
    setProgress(0);

    if (!file || !isCompressibleImageMimeType(file.type)) {
      clearThumbnailInput();
      setHiddenValue(compressedFlagRef.current, "false");
      return;
    }

    try {
      setProgress(20);
      const image = await loadImage(file);
      setProgress(45);
      const fullSize = calculateContainedImageSize({
        maxHeight: MAX_IMAGE_HEIGHT,
        maxWidth: MAX_IMAGE_WIDTH,
        sourceHeight: image.naturalHeight,
        sourceWidth: image.naturalWidth,
      });
      const thumbnailSize = calculateContainedImageSize({
        maxHeight: THUMBNAIL_SIZE,
        maxWidth: THUMBNAIL_SIZE,
        sourceHeight: image.naturalHeight,
        sourceWidth: image.naturalWidth,
      });
      const outputMimeType = getCompressedImageMimeType(file.type);
      const thumbnailBlob = await drawImage(image, thumbnailSize, "image/jpeg");
      setProgress(70);
      const thumbnailFile = new File([thumbnailBlob], getThumbnailFileName(file.name), {
        type: "image/jpeg",
      });

      setFileInput(thumbnailInputRef.current, thumbnailFile);

      if (!preserveOriginal) {
        const compressedBlob = await drawImage(image, fullSize, outputMimeType);
        const compressedFile = new File([compressedBlob], file.name, {
          lastModified: file.lastModified,
          type: outputMimeType,
        });

        setFileInput(fileInputRef.current, compressedFile);
        setHiddenValue(compressedFlagRef.current, "true");
        setProgress(100);
        setStatus(
          `图片已压缩为 ${fullSize.width}x${fullSize.height}，并生成缩略图。`,
        );
      } else {
        setHiddenValue(compressedFlagRef.current, "false");
        setProgress(100);
        setStatus(`已保留原图，并生成 ${thumbnailSize.width}px 缩略图。`);
      }
    } catch {
      clearThumbnailInput();
      setHiddenValue(compressedFlagRef.current, "false");
      setProgress(0);
      setStatus("图片压缩失败，将按原文件上传。");
    }
  }

  function clearThumbnailInput() {
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input
        accept={accept}
        className={className}
        name="file"
        onChange={handleChange}
        ref={fileInputRef}
        required
        type="file"
      />
      <input name="thumbnail" ref={thumbnailInputRef} type="file" hidden />
      <input name="imageWasCompressed" ref={compressedFlagRef} type="hidden" value="false" />

      <label className="flex items-start gap-2 text-sm text-[#34434c]">
        <input
          checked={preserveOriginal}
          className="mt-1 size-4 accent-[#2f6f73]"
          name="preserveOriginalImage"
          onChange={(event) => setPreserveOriginal(event.target.checked)}
          type="checkbox"
        />
        <span>
          保留原图上传。关闭后会压缩图片，可能降低画质；非图片文件不受影响。
        </span>
      </label>

      {status ? (
        <p className="rounded-md border border-[#b8d8ca] bg-[#edf4f1] px-3 py-2 text-sm text-[#2f6f73]">
          {status}
        </p>
      ) : null}
      {progress > 0 && progress < 100 ? (
        <progress
          aria-label="图片压缩进度"
          className="h-2 w-full accent-[#2f6f73]"
          max={100}
          value={progress}
        />
      ) : null}
    </div>
  );
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawImage(
  image: HTMLImageElement,
  dimensions: { height: number; width: number },
  mimeType: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed."))),
      mimeType,
      JPEG_QUALITY,
    );
  });
}

function setFileInput(input: HTMLInputElement | null, file: File) {
  if (!input) {
    return;
  }

  const files = new DataTransfer();
  files.items.add(file);
  input.files = files.files;
}

function setHiddenValue(input: HTMLInputElement | null, value: string) {
  if (input) {
    input.value = value;
  }
}

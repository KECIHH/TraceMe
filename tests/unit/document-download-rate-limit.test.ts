import { describe, expect, it } from "vitest";

import {
  checkDocumentDownloadRateLimit,
  clearDocumentDownloadRateLimitForTests,
  DOCUMENT_DOWNLOAD_RATE_LIMIT_MAX_REQUESTS,
  DOCUMENT_DOWNLOAD_RATE_LIMIT_WINDOW_MS,
} from "@/lib/document-download-rate-limit";

describe("document download rate limit", () => {
  it("blocks repeated downloads in the same window", () => {
    clearDocumentDownloadRateLimitForTests();

    for (
      let index = 0;
      index < DOCUMENT_DOWNLOAD_RATE_LIMIT_MAX_REQUESTS;
      index += 1
    ) {
      expect(checkDocumentDownloadRateLimit("user:trip", 1000).allowed).toBe(
        true,
      );
    }

    expect(checkDocumentDownloadRateLimit("user:trip", 1000).allowed).toBe(
      false,
    );
    expect(
      checkDocumentDownloadRateLimit(
        "user:trip",
        1000 + DOCUMENT_DOWNLOAD_RATE_LIMIT_WINDOW_MS + 1,
      ).allowed,
    ).toBe(true);
  });
});

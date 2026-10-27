/**
 * Pure URL validation for external chapter document links (Spec FR-05.1).
 * Accepted services:
 * - drive.google.com
 * - docs.google.com
 * - 1drv.ms
 * - onedrive.live.com
 * - *.sharepoint.com
 *
 * Rules:
 * - Must be https: only
 * - Other cloud providers (Dropbox, Box, etc.) or http: links are rejected.
 */

export const ALLOWED_CHAPTER_DOMAINS = [
  "drive.google.com",
  "docs.google.com",
  "1drv.ms",
  "onedrive.live.com",
] as const;

export function isValidChapterUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== "string") {
    return false;
  }

  const trimmed = urlString.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Strictly enforce https:
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check exact whitelist domains
    if ((ALLOWED_CHAPTER_DOMAINS as readonly string[]).includes(hostname)) {
      return true;
    }

    // Check *.sharepoint.com or sharepoint.com
    if (hostname === "sharepoint.com" || hostname.endsWith(".sharepoint.com")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function validateChapterUrl(urlString: string): { valid: boolean; error?: string } {
  if (!urlString || typeof urlString !== "string" || !urlString.trim()) {
    return { valid: false, error: "Document URL is required." };
  }

  try {
    const parsed = new URL(urlString.trim());

    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Only secure HTTPS document URLs are permitted." };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (
      (ALLOWED_CHAPTER_DOMAINS as readonly string[]).includes(hostname) ||
      hostname === "sharepoint.com" ||
      hostname.endsWith(".sharepoint.com")
    ) {
      return { valid: true };
    }

    return {
      valid: false,
      error:
        "Unsupported cloud storage provider. Please provide a link from Google Drive, Google Docs, OneDrive, or SharePoint.",
    };
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }
}

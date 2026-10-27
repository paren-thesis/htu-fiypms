import { describe, it, expect } from "vitest";
import { isValidChapterUrl, validateChapterUrl } from "./url";

describe("Chapter Document URL Validator (Spec FR-05.1)", () => {
  it("accepts valid Google Drive URLs", () => {
    expect(isValidChapterUrl("https://drive.google.com/file/d/1a2b3c4d/view?usp=sharing")).toBe(true);
    expect(isValidChapterUrl("https://docs.google.com/document/d/1a2b3c4d/edit")).toBe(true);
  });

  it("accepts valid OneDrive and SharePoint URLs", () => {
    expect(isValidChapterUrl("https://1drv.ms/w/s!Ajb3c_xyz123")).toBe(true);
    expect(isValidChapterUrl("https://onedrive.live.com/?cid=12345&id=67890")).toBe(true);
    expect(isValidChapterUrl("https://htu-my.sharepoint.com/:w:/g/personal/student_htu_edu_gh/xyz")).toBe(true);
    expect(isValidChapterUrl("https://csdept.sharepoint.com/sites/fyp/SharedDocuments/ch1.docx")).toBe(true);
    expect(isValidChapterUrl("https://sharepoint.com/docs/ch1")).toBe(true);
  });

  it("rejects insecure HTTP URLs", () => {
    expect(isValidChapterUrl("http://drive.google.com/file/d/12345")).toBe(false);
    expect(isValidChapterUrl("http://docs.google.com/document/d/12345")).toBe(false);
    expect(isValidChapterUrl("http://1drv.ms/w/12345")).toBe(false);
    expect(isValidChapterUrl("http://htu.sharepoint.com/doc1")).toBe(false);

    const res = validateChapterUrl("http://drive.google.com/file/d/12345");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/HTTPS/i);
  });

  it("rejects Dropbox links (acceptance criteria)", () => {
    expect(isValidChapterUrl("https://dropbox.com/s/xyz123/chapter1.pdf")).toBe(false);
    expect(isValidChapterUrl("https://www.dropbox.com/s/xyz123/chapter1.pdf")).toBe(false);

    const res = validateChapterUrl("https://www.dropbox.com/s/xyz123/chapter1.pdf");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/Unsupported cloud storage provider/i);
  });

  it("rejects other disallowed cloud and generic websites", () => {
    expect(isValidChapterUrl("https://box.com/s/12345")).toBe(false);
    expect(isValidChapterUrl("https://wetransfer.com/downloads/123")).toBe(false);
    expect(isValidChapterUrl("https://github.com/org/repo")).toBe(false);
    expect(isValidChapterUrl("https://mediafire.com/file/123")).toBe(false);
    expect(isValidChapterUrl("https://evil-drive.google.com.attacker.com/file")).toBe(false);
  });

  it("rejects invalid URL formats, empty strings, and non-urls", () => {
    expect(isValidChapterUrl("")).toBe(false);
    expect(isValidChapterUrl("   ")).toBe(false);
    expect(isValidChapterUrl("not-a-url")).toBe(false);
    expect(isValidChapterUrl("javascript:alert(1)")).toBe(false);

    expect(validateChapterUrl("").valid).toBe(false);
    expect(validateChapterUrl("not-a-url").valid).toBe(false);
  });
});

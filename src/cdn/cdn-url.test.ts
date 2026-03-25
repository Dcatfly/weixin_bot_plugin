import { describe, it, expect } from "vitest";
import { buildCdnDownloadUrl, buildCdnUploadUrl } from "./cdn-url.js";

describe("buildCdnDownloadUrl", () => {
  it("constructs correct download URL with simple param", () => {
    const url = buildCdnDownloadUrl("abc123", "https://cdn.example.com");
    expect(url).toBe("https://cdn.example.com/download?encrypted_query_param=abc123");
  });

  it("encodes special characters in encryptedQueryParam", () => {
    const url = buildCdnDownloadUrl("a=b&c=d", "https://cdn.example.com");
    expect(url).toBe(
      "https://cdn.example.com/download?encrypted_query_param=a%3Db%26c%3Dd",
    );
  });

  it("encodes spaces and plus signs", () => {
    const url = buildCdnDownloadUrl("hello world+foo", "https://cdn.example.com");
    expect(url).toBe(
      "https://cdn.example.com/download?encrypted_query_param=hello%20world%2Bfoo",
    );
  });

  it("handles empty encryptedQueryParam", () => {
    const url = buildCdnDownloadUrl("", "https://cdn.example.com");
    expect(url).toBe("https://cdn.example.com/download?encrypted_query_param=");
  });

  it("preserves trailing slash in base URL", () => {
    const url = buildCdnDownloadUrl("param", "https://cdn.example.com/");
    expect(url).toBe("https://cdn.example.com//download?encrypted_query_param=param");
  });

  it("encodes Unicode characters", () => {
    const url = buildCdnDownloadUrl("你好", "https://cdn.example.com");
    expect(url).toBe(
      `https://cdn.example.com/download?encrypted_query_param=${encodeURIComponent("你好")}`,
    );
  });
});

describe("buildCdnUploadUrl", () => {
  it("constructs correct upload URL with simple params", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "upload123",
      filekey: "key456",
    });
    expect(url).toBe(
      "https://cdn.example.com/upload?encrypted_query_param=upload123&filekey=key456",
    );
  });

  it("encodes special characters in uploadParam", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "a=b&c=d",
      filekey: "simple",
    });
    expect(url).toContain("encrypted_query_param=a%3Db%26c%3Dd");
    expect(url).toContain("filekey=simple");
  });

  it("encodes special characters in filekey", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "simple",
      filekey: "path/to/file name.png",
    });
    expect(url).toContain("encrypted_query_param=simple");
    expect(url).toContain(`filekey=${encodeURIComponent("path/to/file name.png")}`);
  });

  it("encodes both params with special characters", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "p=1&q=2",
      filekey: "k=3&v=4",
    });
    expect(url).toBe(
      "https://cdn.example.com/upload?encrypted_query_param=p%3D1%26q%3D2&filekey=k%3D3%26v%3D4",
    );
  });

  it("handles empty uploadParam and filekey", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "",
      filekey: "",
    });
    expect(url).toBe("https://cdn.example.com/upload?encrypted_query_param=&filekey=");
  });

  it("encodes Unicode characters in both params", () => {
    const url = buildCdnUploadUrl({
      cdnBaseUrl: "https://cdn.example.com",
      uploadParam: "参数",
      filekey: "文件",
    });
    expect(url).toBe(
      `https://cdn.example.com/upload?encrypted_query_param=${encodeURIComponent("参数")}&filekey=${encodeURIComponent("文件")}`,
    );
  });
});

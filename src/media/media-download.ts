import fs from "node:fs/promises";
import path from "node:path";
import type { MessageItem } from "../api/types.js";
import { MessageItemType } from "../api/types.js";
import { downloadAndDecryptBuffer, downloadPlainCdnBuffer } from "../cdn/pic-decrypt.js";
import { silkToWav } from "./silk-transcode.js";
import { getMimeFromFilename, getExtensionFromMime, getExtensionFromBuffer } from "./mime.js";
import { logger } from "../util/logger.js";
import { tempFileName } from "../util/random.js";

const WEIXIN_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export type InboundMediaResult = {
  decryptedPicPath?: string;
  decryptedVoicePath?: string;
  voiceMediaType?: string;
  decryptedFilePath?: string;
  fileMediaType?: string;
  decryptedVideoPath?: string;
};

async function saveTempMedia(tempDir: string, buf: Buffer, contentType: string | undefined, originalFilename?: string, explicitExt?: string): Promise<{ path: string }> {
  if (buf.length > WEIXIN_MEDIA_MAX_BYTES) throw new Error(`media too large: ${buf.length} bytes (max ${WEIXIN_MEDIA_MAX_BYTES})`);
  const inboundDir = path.join(tempDir, "media", "inbound");
  await fs.mkdir(inboundDir, { recursive: true });
  const ext = explicitExt ?? (originalFilename ? path.extname(originalFilename) : contentType ? getExtensionFromMime(contentType) : ".bin");
  const name = tempFileName("wx-inbound", ext);
  const filePath = path.join(inboundDir, name);
  await fs.writeFile(filePath, buf);
  return { path: filePath };
}

/**
 * Download and decrypt media from a single MessageItem.
 * Returns the populated InboundMediaResult fields; empty object on unsupported type or failure.
 */
export async function downloadMediaFromItem(
  item: MessageItem,
  deps: {
    cdnBaseUrl: string;
    log: (msg: string) => void;
    errLog: (msg: string) => void;
    label: string;
    tempDir: string;
  },
): Promise<InboundMediaResult> {
  const { cdnBaseUrl, errLog, label, tempDir } = deps;
  const result: InboundMediaResult = {};

  if (item.type === MessageItemType.IMAGE) {
    const img = item.image_item;
    if (!img?.media?.encrypt_query_param) return result;
    const aesKeyBase64 = img.aeskey
      ? Buffer.from(img.aeskey, "hex").toString("base64")
      : img.media.aes_key;
    logger.debug(
      `${label} image: encrypt_query_param=${img.media.encrypt_query_param.slice(0, 40)}... hasAesKey=${Boolean(aesKeyBase64)} aeskeySource=${img.aeskey ? "image_item.aeskey" : "media.aes_key"}`,
    );
    try {
      const buf = aesKeyBase64
        ? await downloadAndDecryptBuffer(
            img.media.encrypt_query_param,
            aesKeyBase64,
            cdnBaseUrl,
            `${label} image`,
          )
        : await downloadPlainCdnBuffer(
            img.media.encrypt_query_param,
            cdnBaseUrl,
            `${label} image-plain`,
          );
      const ext = getExtensionFromBuffer(buf);
      const saved = await saveTempMedia(tempDir, buf, undefined, undefined, ext);
      result.decryptedPicPath = saved.path;
      logger.debug(`${label} image saved: ${saved.path}`);
    } catch (err) {
      logger.error(`${label} image download/decrypt failed: ${String(err)}`);
      errLog(`weixin ${label} image download/decrypt failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VOICE) {
    const voice = item.voice_item;
    if (!voice?.media?.encrypt_query_param || !voice.media.aes_key) return result;
    try {
      const silkBuf = await downloadAndDecryptBuffer(
        voice.media.encrypt_query_param,
        voice.media.aes_key,
        cdnBaseUrl,
        `${label} voice`,
      );
      logger.debug(`${label} voice: decrypted ${silkBuf.length} bytes, attempting silk transcode`);
      const wavBuf = await silkToWav(silkBuf);
      if (wavBuf) {
        const saved = await saveTempMedia(tempDir, wavBuf, "audio/wav");
        result.decryptedVoicePath = saved.path;
        result.voiceMediaType = "audio/wav";
        logger.debug(`${label} voice: saved WAV to ${saved.path}`);
      } else {
        const saved = await saveTempMedia(tempDir, silkBuf, "audio/silk");
        result.decryptedVoicePath = saved.path;
        result.voiceMediaType = "audio/silk";
        logger.debug(`${label} voice: silk transcode unavailable, saved raw SILK to ${saved.path}`);
      }
    } catch (err) {
      logger.error(`${label} voice download/transcode failed: ${String(err)}`);
      errLog(`weixin ${label} voice download/transcode failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.FILE) {
    const fileItem = item.file_item;
    if (!fileItem?.media?.encrypt_query_param || !fileItem.media.aes_key) return result;
    try {
      const buf = await downloadAndDecryptBuffer(
        fileItem.media.encrypt_query_param,
        fileItem.media.aes_key,
        cdnBaseUrl,
        `${label} file`,
      );
      const mime = getMimeFromFilename(fileItem.file_name ?? "file.bin");
      const saved = await saveTempMedia(tempDir, buf, mime, fileItem.file_name ?? undefined);
      result.decryptedFilePath = saved.path;
      result.fileMediaType = mime;
      logger.debug(`${label} file: saved to ${saved.path} mime=${mime}`);
    } catch (err) {
      logger.error(`${label} file download failed: ${String(err)}`);
      errLog(`weixin ${label} file download failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VIDEO) {
    const videoItem = item.video_item;
    if (!videoItem?.media?.encrypt_query_param || !videoItem.media.aes_key) return result;
    try {
      const buf = await downloadAndDecryptBuffer(
        videoItem.media.encrypt_query_param,
        videoItem.media.aes_key,
        cdnBaseUrl,
        `${label} video`,
      );
      const saved = await saveTempMedia(tempDir, buf, "video/mp4");
      result.decryptedVideoPath = saved.path;
      logger.debug(`${label} video: saved to ${saved.path}`);
    } catch (err) {
      logger.error(`${label} video download failed: ${String(err)}`);
      errLog(`weixin ${label} video download failed: ${String(err)}`);
    }
  }

  return result;
}

/** 清理超过 24 小时的临时媒体文件 */
export async function cleanupTempMedia(tempDir: string): Promise<void> {
  const dirs = [
    path.join(tempDir, "media", "inbound"),
    path.join(tempDir, "media", "outbound"),
  ];
  const maxAge = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const filePath = path.join(dir, entry);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          logger.debug(`cleaned up temp file: ${filePath}`);
        }
      }
    } catch {
      // dir doesn't exist or no permission, skip
    }
  }
}

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { authenticatedRequest, joinSubstackUrl } from "../clients/authenticated.js";
import { CliError } from "../core/errors.js";
import { describeDryRun, requireConfirmation } from "../core/safety.js";

type Options = Record<string, unknown>;
type Globals = Record<string, unknown>;
type Result = { data: unknown; dryRun?: boolean };

function required(options: Options, name: string): string {
  const value = options[name];
  if (typeof value !== "string" || !value) throw new CliError("INVALID_ARGUMENT", `--${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)} is required.`, 2);
  return value;
}

function mimeType(filePath: string, explicit: unknown): string {
  if (typeof explicit === "string" && explicit) return explicit;
  const types: Record<string, string> = { ".gif": "image/gif", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const detected = types[extname(filePath).toLowerCase()];
  if (!detected) throw new CliError("INVALID_ARGUMENT", "Could not infer the image MIME type. Pass --content-type.", 2);
  return detected;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CliError("INVALID_RESPONSE", "Substack returned an invalid media-upload response.", 8);
  return value as Record<string, unknown>;
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) if (typeof source[key] === "string" && source[key]) return source[key] as string;
  return undefined;
}

function findUploadUrl(source: Record<string, unknown>): string | undefined {
  const direct = firstString(source, ["upload_url", "uploadUrl", "presigned_url", "presignedUrl"]);
  if (direct) return direct;
  for (const key of ["upload_urls", "uploadUrls", "presigned_urls", "presignedUrls", "parts"]) {
    const values = source[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    if (typeof values[0] === "string") return values[0];
    if (values[0] && typeof values[0] === "object") return firstString(values[0] as Record<string, unknown>, ["url", "upload_url", "presigned_url"]);
  }
  return undefined;
}

async function imageUpload(options: Options, globals: Globals): Promise<Result> {
  const origin = required(options, "publicationUrl");
  const filePath = required(options, "file");
  const url = joinSubstackUrl(origin, "/api/v1/image");
  if (options.dryRun === true) return describeDryRun({ method: "POST", url, body: { file: filePath, contentType: mimeType(filePath, options.contentType) }, impact: "Uploads an image to Substack." });
  requireConfirmation(options.confirm, `Uploads ${filePath} to Substack.`);
  const bytes = await readFile(filePath);
  const image = `data:${mimeType(filePath, options.contentType)};base64,${bytes.toString("base64")}`;
  return { data: await authenticatedRequest({ url, method: "POST", body: { image }, globals }) };
}

async function putBytes(url: string, bytes: Buffer): Promise<string> {
  let response: Response;
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try { response = await fetch(url, { method: "PUT", body }); }
  catch (error) { throw new CliError("NETWORK_ERROR", "The presigned audio upload failed before receiving a response.", 8, false, { cause: error instanceof Error ? error.message : String(error) }); }
  if (!response.ok) throw new CliError("MEDIA_UPLOAD_ERROR", `The presigned audio upload returned HTTP ${response.status}.`, 8, false, { status: response.status });
  const etag = response.headers.get("etag");
  if (!etag) throw new CliError("INVALID_RESPONSE", "The presigned audio upload did not return an ETag.", 8);
  return etag;
}

async function audioUpload(options: Options, globals: Globals): Promise<Result> {
  const origin = required(options, "publicationUrl");
  const filePath = required(options, "file");
  const initUrl = joinSubstackUrl(origin, "/api/v1/audio/upload");
  if (options.dryRun === true) return describeDryRun({ method: "POST+PUT+POST", url: initUrl, body: { file: filePath }, impact: "Uploads audio and starts Substack transcoding." });
  requireConfirmation(options.confirm, `Uploads ${filePath} and starts audio transcoding.`);
  const bytes = await readFile(filePath);
  const initialized = object(await authenticatedRequest({ url: initUrl, method: "POST", body: {}, globals }));
  const uploadId = firstString(initialized, ["media_upload_id", "mediaUploadId", "upload_id", "uploadId", "id"]);
  const uploadUrl = findUploadUrl(initialized);
  if (!uploadId || !uploadUrl) throw new CliError("INVALID_RESPONSE", "Substack did not return an audio upload id and presigned upload URL.", 8);
  const multipartUploadId = new URL(uploadUrl).searchParams.get("uploadId");
  if (!multipartUploadId) throw new CliError("INVALID_RESPONSE", "The presigned audio URL did not contain uploadId.", 8);
  const etag = await putBytes(uploadUrl, bytes);
  const status = await authenticatedRequest({
    url: joinSubstackUrl(origin, `/api/v1/audio/upload/${encodeURIComponent(uploadId)}/transcode`),
    method: "POST",
    body: { duration: null, multipart_upload_id: multipartUploadId, multipart_upload_etags: [etag] },
    globals,
  });
  return { data: { uploadId, status } };
}

export async function executeMediaCommand(operation: string, options: Options, globals: Globals): Promise<Result> {
  if (operation === "image-upload") return imageUpload(options, globals);
  if (operation === "audio-upload") return audioUpload(options, globals);
  throw new CliError("UNSUPPORTED_OPERATION", `Unsupported media operation: ${operation}`, 3, false);
}

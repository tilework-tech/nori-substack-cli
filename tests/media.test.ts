import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, withHttpServer } from "./helpers.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()?.(); });
const state = Buffer.from(JSON.stringify({
  cookies: [{ name: "connect.sid", value: "s%3Amedia", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
})).toString("base64");

describe("media workflows", () => {
  test("uploads an image as the verified JSON data-URI payload", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nori-substack-image-"));
    const file = path.join(directory, "pixel.png");
    const bytes = Buffer.from([137, 80, 78, 71]);
    await writeFile(file, bytes);
    let body = "";
    let requests = 0;
    const server = await withHttpServer((request, response) => {
      requests += 1;
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => { response.setHeader("content-type", "application/json"); response.end("{\"id\":1}"); });
    });
    closers.push(server.close);

    const missingConfirmation = await runCli(["--state-env", "MEDIA_STATE", "media", "image-upload", "--publication-url", server.origin, "--file", file], { MEDIA_STATE: state });
    expect(missingConfirmation.code).toBe(2);
    expect(JSON.parse(missingConfirmation.stderr).error.code).toBe("CONFIRMATION_REQUIRED");
    expect(requests).toBe(0);

    const result = await runCli(["--state-env", "MEDIA_STATE", "media", "image-upload", "--publication-url", server.origin, "--file", file, "--confirm"], { MEDIA_STATE: state });
    expect(result.code, result.stderr).toBe(0);
    expect(requests).toBe(1);
    expect(JSON.parse(body)).toEqual({ image: `data:image/png;base64,${bytes.toString("base64")}` });
  });

  test("completes the audio initiate, raw upload, and transcode sequence", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nori-substack-audio-"));
    const file = path.join(directory, "clip.mp3");
    const bytes = Buffer.from("real-audio-fixture");
    await writeFile(file, bytes);
    const requests: Array<{ method: string; path: string; body: Buffer }> = [];
    let origin = "";
    const server = await withHttpServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        const pathname = new URL(request.url ?? "", "http://local").pathname;
        requests.push({ method: request.method ?? "", path: pathname, body });
        if (pathname === "/api/v1/audio/upload") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ media_upload_id: "audio-1", upload_url: `${origin}/s3?uploadId=multipart-1` }));
          return;
        }
        if (pathname === "/s3") { response.setHeader("etag", "\"fixture-etag\""); response.end(); return; }
        response.setHeader("content-type", "application/json");
        response.end("{\"status\":\"transcoding\"}");
      });
    });
    origin = server.origin;
    closers.push(server.close);

    const result = await runCli(["--state-env", "MEDIA_STATE", "media", "audio-upload", "--publication-url", origin, "--file", file, "--confirm"], { MEDIA_STATE: state });
    expect(result.code, result.stderr).toBe(0);
    expect(requests.map(({ method, path: requestPath }) => [method, requestPath])).toEqual([
      ["POST", "/api/v1/audio/upload"],
      ["PUT", "/s3"],
      ["POST", "/api/v1/audio/upload/audio-1/transcode"],
    ]);
    expect(requests[1].body).toEqual(bytes);
    expect(JSON.parse(requests[2].body.toString("utf8"))).toEqual({
      duration: null,
      multipart_upload_id: "multipart-1",
      multipart_upload_etags: ["\"fixture-etag\""],
    });
    expect(JSON.parse(result.stdout).data).toMatchObject({ uploadId: "audio-1", status: { status: "transcoding" } });
  });

  test("reads audio transcode status", async () => {
    let pathname = "";
    const server = await withHttpServer((request, response) => { pathname = new URL(request.url ?? "", "http://local").pathname; response.setHeader("content-type", "application/json"); response.end("{\"status\":\"ready\"}"); });
    closers.push(server.close);
    const result = await runCli(["--state-env", "MEDIA_STATE", "media", "audio-status", "--publication-url", server.origin, "--upload-id", "audio-1"], { MEDIA_STATE: state });
    expect(result.code, result.stderr).toBe(0);
    expect(pathname).toBe("/api/v1/audio/upload/audio-1");
  });
});

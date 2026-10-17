import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
export const PHOTOS_BUCKET = "library-photos";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export type PickedPhoto = { id: string; type: string; createTime?: string; mediaFile: { baseUrl: string; filename?: string; mimeType: string; mediaFileMetadata?: { width?: number; height?: number } } };

export function photoAssetId(workspaceId: string, photoId: string) {
  const h = createHash("sha256").update(`google-photos:${workspaceId}:${photoId}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

export function photoDownloadUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com") || url.port || url.username || url.password || url.search || url.hash) throw Error("Invalid Google Photos media address.");
  return `${url.href}=w2048-h2048`;
}

function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(`photos-import:${payload}`).digest(); }
export function signPhoto(photo: PickedPhoto, workspaceId: string, userId: string, secret: string) {
  const payload = Buffer.from(JSON.stringify({ photo, workspaceId, userId, expires: Date.now() + 50 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}
export function verifyPhoto(ticket: string, workspaceId: string, userId: string, secret: string): PickedPhoto {
  if (ticket.length > 16000) throw Error("Invalid photo selection.");
  const [payload, mac, extra] = ticket.split(".");
  const supplied = Buffer.from(mac || "", "base64url");
  const expected = signature(payload || "", secret);
  if (extra || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw Error("Invalid photo selection.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.workspaceId !== workspaceId || data.userId !== userId || !(data.expires > Date.now()) || data.photo?.type !== "PHOTO") throw Error("Photo selection expired or belongs to another workspace. Choose your photos again.");
  photoDownloadUrl(data.photo.mediaFile.baseUrl);
  return data.photo;
}

export async function pickerRequest(token: string, path: string, method = "GET", body?: object) {
  const response = await fetch(`https://photospicker.googleapis.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 401) throw Error("Google access expired. Connect Google Photos again.");
    if (response.status === 403) throw Error("Google Photos access was denied. Check that the Photos Picker API is enabled and permission was granted.");
    if (response.status === 429) throw Error("Google Photos is busy. Wait a minute and try again.");
    throw Error("Google Photos could not complete this request. Finish your selection or connect again.");
  }
  return response.status === 204 ? {} : response.json();
}

export async function downloadPhoto(photo: PickedPhoto, token: string) {
  const response = await fetch(photoDownloadUrl(photo.mediaFile.baseUrl), { headers: { Authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw Error("Could not download this photo. Reconnect Google Photos if access expired.");
  const mime = (response.headers.get("content-type") || "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) throw Error("This photo format is not supported. Use JPEG, PNG, WebP or GIF.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PHOTO_BYTES) throw Error("This photo exceeds the 10 MB import limit.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  if (!size) throw Error("Google returned an empty photo.");
  const bytes = Buffer.concat(chunks);
  const valid = mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 : mime === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === "image/gif" ? /^GIF8[79]a/.test(bytes.subarray(0,6).toString()) : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP";
  if (!valid) throw Error("Google returned an invalid image.");
  return { bytes, mime };
}

export const privateHeaders = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

export function environment(name: string) {
  return globalThis.Netlify?.env.get(name) ?? process.env[name];
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function limitedBody(request: Request, maxBytes = 16384) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new Error('Body too large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

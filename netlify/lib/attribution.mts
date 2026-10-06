export function safeLabel(value: unknown, maximum = 80) {
  return typeof value === 'string' && /^[a-zA-Z0-9_ .:/-]+$/.test(value) && !value.includes('@') ? value.slice(0, maximum) : null;
}

export function safePath(value: unknown) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_/-]*$/.test(value) || value.startsWith('//')) return null;
  return value.slice(0, 180);
}

export function sessionId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function attribution(parameters: URLSearchParams, request: Request) {
  const utm: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = safeLabel(parameters.get(key));
    if (value) utm[key] = value;
  }
  let source = safeLabel(parameters.get('source'));
  if (!source) {
    try {
      const referrer = new URL(request.headers.get('referer') || '');
      source = referrer.origin === new URL(request.url).origin ? 'website' : referrer.hostname;
    } catch {
      source = 'direct';
    }
  }
  const cookieSession = request.headers.get('cookie')?.match(/(?:^|;\s*)cfw_session=([^;]+)/)?.[1];
  return {
    session_id: sessionId(parameters.get('session_id')) || sessionId(cookieSession) || crypto.randomUUID(),
    source,
    utm,
    landing_page: safePath(parameters.get('landing_page')) || '/cash-flow',
    placement: safeLabel(parameters.get('placement')) || 'cash-flow-cta',
  };
}

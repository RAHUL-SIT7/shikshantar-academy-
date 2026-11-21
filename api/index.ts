import { createApp } from '../server.js';

let appPromise: Promise<any> | null = null;

function getExpressApp() {
  if (!appPromise) {
    appPromise = createApp({ skipVite: true, skipOutboxWorker: true });
  }
  return appPromise;
}

function normalizeVercelRequestUrl(req: any) {
  const rawUrl = String(req?.url || '/');
  const parsed = new URL(rawUrl, 'http://localhost');
  const routeParam = parsed.searchParams.get('__route');

  if (routeParam) {
    parsed.searchParams.delete('__route');
    const cleanRoute = routeParam.replace(/^\/+/, '').replace(/^api\//i, '');
    const remainingQuery = parsed.searchParams.toString();
    req.url = `/api/${cleanRoute}${remainingQuery ? `?${remainingQuery}` : ''}`;
    try {
      if (req.query && typeof req.query === 'object' && '__route' in req.query) {
        delete req.query.__route;
      }
    } catch {
      // Ignore read-only query descriptor on Vercel Node runtime
    }
  } else if (!parsed.pathname.startsWith('/api/')) {
    const cleanPath = parsed.pathname.replace(/^\/+/, '');
    const remainingQuery = parsed.searchParams.toString();
    req.url = `/api/${cleanPath}${remainingQuery ? `?${remainingQuery}` : ''}`;
  }
}

export default async function handler(req: any, res: any) {
  try {
    normalizeVercelRequestUrl(req);
    try {
      const incomingBody = req.body;
      if (incomingBody !== undefined && incomingBody !== null) {
        if (typeof incomingBody === 'string') {
          try {
            Object.defineProperty(req, 'body', {
              value: JSON.parse(incomingBody),
              writable: true,
              configurable: true,
              enumerable: true
            });
          } catch {
            // Keep raw string if not valid JSON
          }
        }
        req._body = true;
      }
    } catch {
      // Let Express body-parser handle unparsed stream if Vercel lazy body getter threw
    }

    const app = await getExpressApp();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: any) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      if (typeof res.once === 'function') {
        res.once('finish', () => done());
        res.once('close', () => done());
        res.once('error', (err: any) => done(err));
      }

      app(req, res, (err: any) => {
        if (err) done(err);
        else if (res.writableEnded || res.headersSent) done();
      });
    });
  } catch (err: any) {
    console.error('[VERCEL API] Handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'Server error while processing API request.',
        details: err?.message || 'Unknown error'
      }));
    }
  }
}

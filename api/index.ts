import { applyCorsAndSecurityHeaders } from './_lib/auth';
import auditLogHandler from './_handlers/audit/log';
import authHeartbeatHandler from './_handlers/auth/heartbeat';
import authLogoutHandler from './_handlers/auth/logout';
import authLogoutOtherSessionsHandler from './_handlers/auth/logout-other-sessions';
import authPublicConfigHandler from './_handlers/auth/public-config';
import authRecordLoginHandler from './_handlers/auth/record-login';
import authRevokeSessionHandler from './_handlers/auth/revoke-session';
import authVerifyCaptchaHandler from './_handlers/auth/verify-captcha';
import birthdaySendWishesHandler from './_handlers/birthday/send-wishes';
import publicSubmitAdmissionHandler from './_handlers/public/submit-admission';
import publicSubmitAlumniHandler from './_handlers/public/submit-alumni';
import publicSubmitEnquiryHandler from './_handlers/public/submit-enquiry';
import resultsSendPublicationEmailsHandler from './_handlers/results/send-publication-emails';
import usersCreateHandler from './_handlers/users/create';

type RouteHandler = (req: any, res: any) => Promise<any> | any;

const ROUTES: Record<string, RouteHandler> = {
  'audit/log': auditLogHandler,
  'auth/heartbeat': authHeartbeatHandler,
  'auth/logout': authLogoutHandler,
  'auth/logout-other-sessions': authLogoutOtherSessionsHandler,
  'auth/public-config': authPublicConfigHandler,
  'auth/record-login': authRecordLoginHandler,
  'auth/revoke-session': authRevokeSessionHandler,
  'auth/verify-captcha': authVerifyCaptchaHandler,
  'auth/verify-turnstile': authVerifyCaptchaHandler,
  'birthday/send-wishes': birthdaySendWishesHandler,
  'public/submit-admission': publicSubmitAdmissionHandler,
  'public/submit-alumni': publicSubmitAlumniHandler,
  'public/submit-enquiry': publicSubmitEnquiryHandler,
  'results/send-publication-emails': resultsSendPublicationEmailsHandler,
  'users/create': usersCreateHandler,
};

function resolveApiRoute(req: any): string {
  const rawQueryRoute = req?.query?.__route;
  if (typeof rawQueryRoute === 'string' && rawQueryRoute.trim()) {
    return rawQueryRoute.replace(/^\/+|\/+$/g, '').replace(/^api\//i, '');
  }
  if (Array.isArray(rawQueryRoute) && rawQueryRoute.length > 0) {
    return rawQueryRoute.join('/').replace(/^\/+|\/+$/g, '').replace(/^api\//i, '');
  }

  const rawUrl = String(req?.url || '');
  const pathname = rawUrl.split('?')[0] || '';
  return pathname.replace(/^\/+|\/+$/g, '').replace(/^api\//i, '');
}

export default async function handler(req: any, res: any) {
  const routeKey = resolveApiRoute(req);

  if (req?.query && '__route' in req.query) {
    delete req.query.__route;
  }

  const targetHandler = ROUTES[routeKey];
  if (!targetHandler) {
    applyCorsAndSecurityHeaders(req, res, 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return res.status(404).json({
      error: `API route '/api/${routeKey}' not found.`,
    });
  }

  return targetHandler(req, res);
}

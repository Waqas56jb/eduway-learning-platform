/**
 * Express application factory (no network listener — see server.ts). Used by tests via supertest.
 */
import compression from 'compression';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { adminAuditTrail } from './common/middleware/audit.js';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler.js';
import { rateLimits } from './common/middleware/rateLimit.js';
import { clientContext, locale, requestId } from './common/middleware/requestContext.js';
import './common/types/index.js';
import { devFlags, env, trustProxySetting } from './config/env.js';
import { logger } from './config/logger.js';
import { generateOpenApiDocument } from './docs/openapi.js';
import { modules } from './modules/index.js';

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/;

export function corsOptions(): CorsOptions {
  const allowed = new Set([...env.CORS_ORIGINS, env.ADMIN_APP_URL, env.USER_APP_URL]);
  return {
    origin(origin, cb) {
      // Native apps / curl send no Origin header. LAN/localhost origins only with DEV_LAN_CORS (SEC-21).
      if (!origin || allowed.has(origin) || (devFlags.lanCors && DEV_ORIGIN.test(origin))) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Request-Id', 'X-Client-Platform', 'X-Device-Id', 'X-App-Version', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'Content-Language', 'Retry-After', 'Idempotent-Replayed', 'RateLimit', 'RateLimit-Policy', 'Content-Disposition'],
    maxAge: 600,
  };
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  // SEC-22: only the configured proxy hops may set X-Forwarded-For (per-IP rate limits, lockouts, audit IPs).
  app.set('trust proxy', trustProxySetting(env.TRUST_PROXY));
  app.set('query parser', 'extended');

  app.use(requestId, locale, clientContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions()));
  app.use(
    compression({
      filter: (req, res) => !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') && req.headers.accept !== 'text/event-stream' && compression.filter(req, res),
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(rateLimits.global);
  app.use(adminAuditTrail);

  // API documentation (OpenAPI generated from the zod schemas registered by the route builder).
  // Never in production; elsewhere only with API_DOCS_PUBLIC (default on for an explicit NODE_ENV=development/test).
  // It maps every admin endpoint (SEC-09, SEC-21).
  if (devFlags.apiDocs) {
    app.get('/api/docs/openapi.json', (_req, res) => {
      res.json(generateOpenApiDocument());
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/docs/openapi.json', persistAuthorization: true }, customSiteTitle: 'EDUWAY API' }));
  }

  for (const m of modules) app.use(env.API_PREFIX, m.router);

  app.get('/', (_req, res) => {
    res.json({ success: true, data: { name: 'EDUWAY API', version: '1.0.0', docs: devFlags.apiDocs ? '/api/docs' : null, api: env.API_PREFIX } });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

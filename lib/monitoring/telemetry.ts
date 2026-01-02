import type { NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/db/admin';
import { log } from '@/lib/utils/logger';
import type { Database } from '@/supabase/database.types';

interface AdminTelemetryOptions {
  method: string;
  path: string;
  status: number;
  durationMs?: number;
  adminUserId?: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

type AdminEventInsert = Database['public']['Tables']['admin_api_events']['Insert'];

export type HandlerTelemetry = Pick<
  AdminTelemetryOptions,
  'adminUserId' | 'targetType' | 'targetId' | 'metadata'
>;

export type HandlerResult =
  | Response
  | {
      response: Response;
      telemetry?: HandlerTelemetry;
    };

function getAdminUserIdFromContext(context: unknown): string | undefined {
  if (!context || typeof context !== 'object') return undefined;
  if (!('adminUserId' in context)) return undefined;
  const adminUserId = (context as { adminUserId?: unknown }).adminUserId;
  return typeof adminUserId === 'string' ? adminUserId : undefined;
}

async function writeAdminEvent(payload: AdminEventInsert) {
  const admin = getAdminClient();
  const { error } = await admin.from('admin_api_events').insert(payload);
  if (error) {
    log.error('Failed to store admin_api_event', error, {
      action: 'admin_api_event_insert_failed',
      metadata: payload.metadata,
      status: payload.status,
    });
  }
}

export async function recordAdminApiEvent(options: AdminTelemetryOptions) {
  log.info('admin_api_event', {
    action: 'admin_api_event',
    method: options.method,
    path: options.path,
    status: options.status,
    durationMs: options.durationMs,
    adminUserId: options.adminUserId,
    targetType: options.targetType,
    targetId: options.targetId,
  });

  await writeAdminEvent({
    method: options.method,
    path: options.path,
    status: options.status,
    duration_ms: options.durationMs,
    admin_user_id: options.adminUserId,
    target_type: options.targetType,
    target_id: options.targetId,
    ip_address: options.ipAddress ?? null,
    user_agent: options.userAgent ?? null,
    metadata: options.metadata ?? {},
  });
}

export function withAdminTelemetry<TContext>(
  label: string,
  handler: (req: NextRequest, context: TContext) => Promise<HandlerResult>
) {
  return async (req: NextRequest, context: TContext) => {
    const start = performance.now();
    let status = 500;
    let handlerTelemetry: HandlerTelemetry | undefined;

    try {
      const result = await handler(req, context);
      const response = result instanceof Response ? result : result.response;
      status = response.status;
      handlerTelemetry = result instanceof Response ? undefined : result.telemetry;
      return response;
    } catch (error) {
      log.error(`${label} handler threw`, error as Error, { action: 'admin_api_exception' });
      throw error;
    } finally {
      const end = performance.now();
      await recordAdminApiEvent({
        method: req.method,
        path: label,
        status,
        durationMs: Math.round(end - start),
        adminUserId: handlerTelemetry?.adminUserId ?? getAdminUserIdFromContext(context),
        targetType: handlerTelemetry?.targetType,
        targetId: handlerTelemetry?.targetId,
        metadata: handlerTelemetry?.metadata,
        ipAddress: req.headers.get('x-forwarded-for') ?? req.ip ?? null,
        userAgent: req.headers.get('user-agent'),
      });
    }
  };
}

export function respondWithTelemetry(response: Response, telemetry?: HandlerTelemetry): HandlerResult {
  return { response, telemetry };
}

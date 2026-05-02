import { NextRequest } from 'next/server';
import { retryPending } from '@/lib/services/visitor-requests';

export const dynamic = 'force-dynamic';

// Hourly retry of visitor requests that failed first-dispatch (e.g. SMTP
// blip when the original request came in). Triggered by the GitHub
// Actions cron workflow with a shared secret. The retryPending() service
// caps at 20 requests per run.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await retryPending();
  return Response.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}

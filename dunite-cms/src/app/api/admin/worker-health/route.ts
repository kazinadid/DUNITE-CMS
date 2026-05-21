/**
 * Worker Health Check API
 * 
 * GET /api/admin/worker-health
 * 
 * Returns worker metrics, queue depth, and health status.
 * Requires admin role.
 */

import { NextRequest } from 'next/server';
import { getMetricsSnapshot, getQueueDepth, getRecentFailures } from '@/lib/publishing/worker-observability';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    void req;
    const { supabase, user } = await createAuthenticatedSupabaseServerClient();
    
    // Get user role to check if admin
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Gather all health data in parallel
    const [metricsSnapshot, queueDepth, recentFailures] = await Promise.allSettled([
      Promise.resolve(getMetricsSnapshot()),
      getQueueDepth(url, key),
      getRecentFailures(url, key, 10),
    ]);
    
    const response = {
      ok: true,
      data: {
        metrics: metricsSnapshot.status === 'fulfilled' ? metricsSnapshot.value : null,
        queueDepth: queueDepth.status === 'fulfilled' ? queueDepth.value : null,
        recentFailures: recentFailures.status === 'fulfilled' ? recentFailures.value : null,
        errors: {
          metrics: metricsSnapshot.status === 'rejected' ? metricsSnapshot.reason?.message : null,
          queueDepth: queueDepth.status === 'rejected' ? queueDepth.reason?.message : null,
          recentFailures: recentFailures.status === 'rejected' ? recentFailures.reason?.message : null,
        },
      },
      timestamp: new Date().toISOString(),
    };
    
    const res = new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    
    return res;
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
    );
  }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { drainPushOutbox } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function authorized(req: Request, url: string, anon: string, service: string) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return false;
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (service && bearer === service) return true;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  return !error && Boolean(data.user);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!(await authorized(req, url, anon, service))) {
      return new Response(JSON.stringify({ ok: false, message: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(url, service || anon);
    const result = await drainPushOutbox(admin);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : 'İstek işlenemedi.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

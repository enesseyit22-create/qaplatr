import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, message: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({})) as { kind?: string };
    const kind = body.kind === 'business' ? 'business' : body.kind === 'user' ? 'user' : null;
    if (!kind) {
      return new Response(JSON.stringify({ ok: false, message: 'kind gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ ok: false, message: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(url, service || anon);
    const flag = kind === 'user' ? 'notify_user_signup' : 'notify_business_signup';
    const { data: rows, error } = await adminClient
      .from('admin_settings')
      .select('fcm_token')
      .eq(flag, true);

    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokens = [...new Set((rows ?? []).map((row) => String(row.fcm_token ?? '').trim()).filter(Boolean))];
    const title = kind === 'user' ? 'Yeni Kullanıcı Kaydoldu' : 'Yeni Firma Başvurusu Bulunuyor';
    const bodyText = kind === 'user'
      ? 'Uygulamaya yeni bir üye kaydoldu.'
      : 'Onay bekleyen yeni bir firma başvurusu var.';

    const key = Deno.env.get('FCM_SERVER_KEY') ?? Deno.env.get('FIREBASE_SERVER_KEY') ?? '';
    let sent = 0;
    if (key) {
      for (const token of tokens) {
        const res = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            Authorization: `key=${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            priority: 'high',
            notification: { title, body: bodyText, sound: 'default' },
            data: { kind, title, body: bodyText },
          }),
        });
        if (res.ok) sent += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, kind, targets: tokens.length, sent }), {
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

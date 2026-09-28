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
    const { campaign_id: campaignId, user_id: userId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'NOT_FOUND',
        message: 'campaign_id zorunludur.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      },
    );

    const { data, error } = await supabase.rpc('redeem_campaign', {
      p_campaign_id: campaignId,
      p_user_id: userId ?? null,
    });

    if (error) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'ERROR',
        message: error.message,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'ERROR',
      message: error instanceof Error ? error.message : 'İstek işlenemedi.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

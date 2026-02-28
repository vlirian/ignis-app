import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UnitIncident = {
  unitId: number
  incidents: Array<{ item: string; zone: string; note?: string }>
}

function escapeHtml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
    const emailFrom = Deno.env.get('INCIDENT_EMAIL_FROM') || 'IGNIS <onboarding@resend.dev>'

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase env vars')
    if (!resendApiKey) throw new Error('Missing RESEND_API_KEY')

    const payload = await req.json()
    const reportDate = String(payload?.reportDate || '')
    const bomberoId = Number(payload?.bomberoId || 0)
    const reviewedBy = String(payload?.reviewedBy || '')
    const units = (payload?.units || []) as UnitIncident[]

    const validUnits = units.filter(u => Array.isArray(u.incidents) && u.incidents.length > 0)
    if (validUnits.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_incidents' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sb = createClient(supabaseUrl, serviceRoleKey)
    const { data: recipientsData, error: recipientsErr } = await sb
      .from('incident_email_recipients')
      .select('email')
      .eq('enabled', true)

    if (recipientsErr) throw recipientsErr
    const recipients = (recipientsData || []).map(r => String(r.email || '').trim().toLowerCase()).filter(Boolean)
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const subject = `[IGNIS] Incidencias detectadas BV${bomberoId} · ${reportDate}`
    const totalIncidents = validUnits.reduce((acc, u) => acc + u.incidents.length, 0)
    const unitsHtml = validUnits.map(u => {
      const unitLabel = `U${String(u.unitId).padStart(2, '0')}`
      const rows = u.incidents.map(i => {
        const item = escapeHtml(i.item || '—')
        const zone = escapeHtml(i.zone || '—')
        const note = escapeHtml(i.note || '')
        return `<li><strong>${item}</strong> · ${zone}${note ? ` · ${note}` : ''}</li>`
      }).join('')
      return `<h4 style="margin:12px 0 6px">${unitLabel}</h4><ul style="margin:0 0 10px 18px;padding:0">${rows}</ul>`
    }).join('')

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.45">
        <h2 style="margin:0 0 10px">IGNIS · Aviso de incidencias</h2>
        <p style="margin:0 0 6px"><strong>Fecha:</strong> ${escapeHtml(reportDate)}</p>
        <p style="margin:0 0 6px"><strong>Bombero:</strong> BV${bomberoId}</p>
        <p style="margin:0 0 10px"><strong>Revisado por:</strong> ${escapeHtml(reviewedBy || 'desconocido')}</p>
        <p style="margin:0 0 10px"><strong>Total incidencias:</strong> ${totalIncidents}</p>
        ${unitsHtml}
      </div>
    `

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: recipients,
        subject,
        html,
      }),
    })

    if (!resendResp.ok) {
      const errText = await resendResp.text()
      throw new Error(`Resend error: ${errText}`)
    }

    const resendData = await resendResp.json()
    return new Response(JSON.stringify({ ok: true, sent: recipients.length, id: resendData?.id || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'unknown_error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})


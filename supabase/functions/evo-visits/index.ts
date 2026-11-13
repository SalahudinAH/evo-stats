// EVO Stats: live crowd numbers for an EVO centre, from EVO's public "EVO Visits" page
// (visits.evofitness.no). EVO's API doesn't allow browsers on other sites to call it,
// so the app asks this function and it asks EVO.
//
// Deploy: Supabase dashboard › Edge Functions › Deploy a new function › Via Editor,
// name it "evo-visits", paste this file, Deploy. Leave "Verify JWT" on, so only
// signed-in users of your app can use it.

const EVO = 'https://visits.evofitness.no/api/v1/locations'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function reply(body: unknown, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' },
  })
}

async function get(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`EVO answered ${res.status}`)
  return res.json()
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let id = new URL(req.url).searchParams.get('id')
  if (!id && req.method === 'POST') {
    try { id = (await req.json())?.id ?? null } catch { /* no body */ }
  }
  if (!id || !UUID.test(id)) return reply({ error: 'Send the EVO Visits id of a centre.' }, 400)

  try {
    const [now, timeline] = await Promise.all([get(`${EVO}/${id}/current`), get(`${EVO}/${id}/timeline`).catch(() => null)])
    return reply({
      id,
      name: now.name,
      current: now.current,
      capacity: now.max_capacity,
      percent: now.percentageUsed,
      intervals: (timeline?.intervals ?? []).map((i: { begin: number; end: number; name: string; percentageUsed: number; status: string }) => ({
        begin: i.begin, end: i.end, label: i.name, percent: i.percentageUsed, status: i.status,
      })),
      fetchedAt: new Date().toISOString(),
    }, 200, 60)
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'EVO Visits did not answer.' }, 502)
  }
})

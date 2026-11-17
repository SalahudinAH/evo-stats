// EVO Stats: estimate calories and macros from a photo of a meal, using Google Gemini.
// The app sends a downsized JPEG (and an optional hint like "200 g chicken"); this function
// asks Gemini for each food it can see, with grams and nutrition, and sends that back.
// You check and adjust it in the app before anything is logged.
//
// Setup (once):
//  1. Get a free API key at https://aistudio.google.com/apikey
//  2. Supabase dashboard › Edge Functions › Secrets › add GEMINI_API_KEY with that key.
//     (Optional: GEMINI_MODEL to pick a model; default is the newest Flash, "gemini-flash-latest".)
//  3. Deploy this file as the function "food-photo" with "Verify JWT" on, so only signed-in
//     users of your app can use it.
// The key stays on Supabase; it is never sent to the app or stored in GitHub.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MAX_BASE64 = 2_000_000 // ≈1.5 MB image; the app sends ~150–300 KB

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

const PROMPT = `You are a nutrition assistant. Look at this photo of a meal and list each separate food or drink you can see.
For each, estimate the eaten amount in grams (or ml for drinks, counted as grams) and its total nutrition for that amount:
kcal, protein, carbs and fat in grams. Judge portion size from the plate, cutlery, hands or packaging.
Include likely cooking oil, butter and sauces when they are visible or typical for the dish.
Use short, plain English names (e.g. "Grilled chicken breast", "White rice", "Caesar dressing").
If the photo shows no food, return an empty list and say so in "note".
"note" is one short sentence about what was hard to judge, or empty.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['items', 'note'],
}

const num = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return reply({ error: 'not_set_up', message: 'Add GEMINI_API_KEY under Edge Functions › Secrets.' }, 501)
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'

  let image = '', hint = ''
  try {
    const body = await req.json()
    image = String(body?.image ?? '').replace(/^data:image\/\w+;base64,/, '')
    hint = String(body?.hint ?? '').slice(0, 300)
  } catch { /* fall through */ }
  if (!image || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) return reply({ error: 'Send a JPEG photo (base64).' }, 400)

  const parts: unknown[] = [{ text: PROMPT + (hint ? `\nThe person adds: "${hint}". Trust this over what you see.` : '') }, { inlineData: { mimeType: 'image/jpeg', data: image } }]
  let res: Response
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(40_000),
    })
  } catch {
    return reply({ error: 'timeout', message: 'The AI took too long. Try again.' }, 504)
  }
  if (res.status === 429) return reply({ error: 'busy', message: 'Too many photos right now (free limit). Try again in a minute.' }, 429)
  if (res.status === 400 || res.status === 403) {
    const detail = await res.text().catch(() => '')
    const badKey = /API key|API_KEY|permission/i.test(detail)
    return reply({ error: badKey ? 'bad_key' : 'rejected', message: badKey ? 'Gemini rejected the API key. Check GEMINI_API_KEY.' : 'Gemini could not read that photo.' }, 502)
  }
  if (!res.ok) return reply({ error: 'upstream', message: `Gemini answered ${res.status}. Try again.` }, 502)

  try {
    const data = await res.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const parsed = JSON.parse(text)
    const items = (Array.isArray(parsed?.items) ? parsed.items : []).slice(0, 12).map((i: Record<string, unknown>) => ({
      name: String(i.name ?? 'Food').slice(0, 80),
      grams: num(i.grams, 3000),
      kcal: Math.round(num(i.kcal, 5000)),
      protein: num(i.protein, 500),
      carbs: num(i.carbs, 800),
      fat: num(i.fat, 500),
    })).filter((i: { grams: number; kcal: number }) => i.grams > 0 || i.kcal > 0)
    return reply({ items, note: String(parsed?.note ?? '').slice(0, 200), model })
  } catch {
    return reply({ error: 'unreadable', message: 'The AI gave an answer the app could not read. Try again.' }, 502)
  }
})

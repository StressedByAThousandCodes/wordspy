export interface WordPair {
  civilian: string
  spy: string
}

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const PROMPT = `Return ONLY a JSON object, no other text, no markdown, no explanation.
The JSON must have exactly two keys: "civilian" and "spy".
Both values must be common everyday nouns that are related but different enough to cause confusion in a word guessing game.
Example output: {"civilian":"piano","spy":"guitar"}`

const FALLBACK_WORD_PAIRS: WordPair[] = [
  { civilian: 'piano', spy: 'guitar' },
  { civilian: 'swimming pool', spy: 'lake' },
  { civilian: 'coffee', spy: 'tea' },
  { civilian: 'airplane', spy: 'helicopter' },
  { civilian: 'hospital', spy: 'clinic' },
  { civilian: 'chess', spy: 'checkers' },
  { civilian: 'diamond', spy: 'crystal' },
  { civilian: 'passport', spy: 'ID card' },
  { civilian: 'submarine', spy: 'boat' },
  { civilian: 'telescope', spy: 'binoculars' },
  { civilian: 'library', spy: 'bookstore' },
  { civilian: 'motorcycle', spy: 'bicycle' },
  { civilian: 'prison', spy: 'school' },
  { civilian: 'volcano', spy: 'mountain' },
  { civilian: 'sushi', spy: 'sashimi' },
  { civilian: 'butter', spy: 'margarine' },
  { civilian: 'crocodile', spy: 'alligator' },
  { civilian: 'trumpet', spy: 'trombone' },
  { civilian: 'opera', spy: 'musical' },
  { civilian: 'kayak', spy: 'canoe' },
  { civilian: 'notebook', spy: 'journal' },
  { civilian: 'fork', spy: 'spoon' },
  { civilian: 'candle', spy: 'lamp' },
  { civilian: 'river', spy: 'lake' },
  { civilian: 'mountain', spy: 'hill' },
  { civilian: 'wallet', spy: 'purse' },
  { civilian: 'camera', spy: 'binoculars' },
  { civilian: 'helmet', spy: 'hat' },
  { civilian: 'blanket', spy: 'towel' },
  { civilian: 'soap', spy: 'shampoo' },
  { civilian: 'window', spy: 'mirror' },
  { civilian: 'clock', spy: 'watch' },
  { civilian: 'desk', spy: 'table' },
  { civilian: 'couch', spy: 'bench' },
  { civilian: 'painting', spy: 'photograph' },
  { civilian: 'socks', spy: 'gloves' },
  { civilian: 'ring', spy: 'bracelet' },
  { civilian: 'apple', spy: 'pear' },
  { civilian: 'orange', spy: 'tangerine' },
  { civilian: 'cake', spy: 'pie' },
  { civilian: 'burger', spy: 'sandwich' },
  { civilian: 'train', spy: 'subway' },
  { civilian: 'airport', spy: 'station' },
  { civilian: 'doctor', spy: 'nurse' },
  { civilian: 'teacher', spy: 'professor' },
  { civilian: 'pencil', spy: 'marker' },
  { civilian: 'eraser', spy: 'sharpener' },
  { civilian: 'cloud', spy: 'fog' },
  { civilian: 'storm', spy: 'hurricane' },
  { civilian: 'ocean', spy: 'sea' },
  { civilian: 'island', spy: 'peninsula' },
  { civilian: 'forest', spy: 'jungle' },
  { civilian: 'lion', spy: 'tiger' },
  { civilian: 'rabbit', spy: 'hamster' },
  { civilian: 'eagle', spy: 'hawk' },
  { civilian: 'boat', spy: 'canoe' },
  { civilian: 'ship', spy: 'yacht' },
  { civilian: 'phone', spy: 'radio' },
  { civilian: 'television', spy: 'projector' },
  { civilian: 'keyboard', spy: 'typewriter' },
  { civilian: 'printer', spy: 'scanner' },
  { civilian: 'battery', spy: 'generator' },
  { civilian: 'rocket', spy: 'missile' },
  { civilian: 'castle', spy: 'palace' },
  { civilian: 'church', spy: 'chapel' },
  { civilian: 'street', spy: 'alley' },
  { civilian: 'bridge', spy: 'tunnel' },
  { civilian: 'shirt', spy: 'jacket' },
  { civilian: 'shoes', spy: 'boots' },
  { civilian: 'belt', spy: 'tie' },
  { civilian: 'glasses', spy: 'goggles' },
  { civilian: 'bread', spy: 'toast' },
  { civilian: 'rice', spy: 'pasta' },
  { civilian: 'soup', spy: 'stew' },
  { civilian: 'salt', spy: 'sugar' },
  { civilian: 'violin', spy: 'cello' },
  { civilian: 'drum', spy: 'tambourine' },
  { civilian: 'book', spy: 'magazine' },
  { civilian: 'newspaper', spy: 'flyer' },
  { civilian: 'garden', spy: 'park' },
  { civilian: 'farm', spy: 'ranch' },
  { civilian: 'chef', spy: 'baker' },
  { civilian: 'waiter', spy: 'bartender' },
  { civilian: 'police', spy: 'security' },
  { civilian: 'firefighter', spy: 'paramedic' },
  { civilian: 'museum', spy: 'library' },
  { civilian: 'school', spy: 'university' },
  { civilian: 'battery charger', spy: 'battery' },
  { civilian: 'computer', spy: 'tablet' },
  { civilian: 'monitor', spy: 'television' },
  { civilian: 'mouse', spy: 'trackpad' },
  { civilian: 'hammer', spy: 'wrench' },
  { civilian: 'screwdriver', spy: 'drill' },
  { civilian: 'ladder', spy: 'stairs' },
  { civilian: 'tent', spy: 'cabin' },
  { civilian: 'beach', spy: 'desert' },
  { civilian: 'snow', spy: 'hail' },
  { civilian: 'raincoat', spy: 'umbrella' },
  { civilian: 'ticket', spy: 'receipt' },
  { civilian: 'mailbox', spy: 'locker' },
  { civilian: 'garage', spy: 'warehouse' },
  { civilian: 'fan', spy: 'air conditioner' },
  { civilian: 'refrigerator', spy: 'freezer' },
  { civilian: 'microwave', spy: 'oven' },
  { civilian: 'plate', spy: 'tray' },
  { civilian: 'cup', spy: 'mug' },
  { civilian: 'straw', spy: 'spoon' },
  { civilian: 'coin', spy: 'token' },
  { civilian: 'cash', spy: 'voucher' },
  { civilian: 'map', spy: 'globe' },
  { civilian: 'compass', spy: 'GPS' },
  { civilian: 'rope', spy: 'chain' },
  { civilian: 'lock', spy: 'key' },
  { civilian: 'brush', spy: 'comb' },
  { civilian: 'perfume', spy: 'cologne' },
];

function getFallbackWordPair(): WordPair {
  return FALLBACK_WORD_PAIRS[Math.floor(Math.random() * FALLBACK_WORD_PAIRS.length)]
}

// async function generateFromGemini(apiKey: string): Promise<WordPair> {
//   const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       contents: [{ parts: [{ text: PROMPT }] }],
//       generationConfig: {
//         temperature: 0.9,
//         maxOutputTokens: 60,         // JSON object is ~30 tokens, 60 is safe
//         responseMimeType: 'application/json',
//         responseSchema: {
//           type: 'object',
//           properties: {
//             civilian: { type: 'string' },
//             spy:      { type: 'string' },
//           },
//           required: ['civilian', 'spy'],
//         },
//       },
//     }),
//   })

//   if (!response.ok) {
//     const err = await response.text()
//     throw new Error(`Gemini API error ${response.status}: ${err}`)
//   }

//   const data = await response.json()
//   const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
//   console.log('Gemini raw response:', JSON.stringify(rawText))

//   // Try parsing directly first (responseMimeType should give clean JSON)
//   try {
//     const pair = JSON.parse(rawText) as WordPair
//     if (pair.civilian && pair.spy) return pair
//   } catch { /* fall through to extraction */ }

//   // Fallback — extract first {...} block
//   const jsonMatch = rawText.match(/\{[\s\S]*?\}/)
//   if (!jsonMatch) {
//     throw new Error(`No JSON object found in Gemini response: ${JSON.stringify(rawText)}`)
//   }

//   const pair = JSON.parse(jsonMatch[0]) as WordPair
//   if (!pair.civilian || !pair.spy) {
//     throw new Error(`Invalid word pair shape: ${JSON.stringify(pair)}`)
//   }

//   return pair
// }

async function generateFromGemini(apiKey: string): Promise<WordPair> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            civilian: { type: 'STRING' },
            spy:      { type: 'STRING' },
          },
          required: ['civilian', 'spy'],
        },
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${err}`)
  }

  const data = await response.json()

  // Log the full response structure to diagnose issues
  console.log('Gemini full response:', JSON.stringify(data, null, 2))

  const candidate = data.candidates?.[0]
  const rawText: string = candidate?.content?.parts?.[0]?.text ?? ''
  console.log('Gemini raw text:', JSON.stringify(rawText))
  console.log('Finish reason:', candidate?.finishReason)

  if (!rawText) {
    throw new Error(`Empty response from Gemini. Finish reason: ${candidate?.finishReason}. Full: ${JSON.stringify(data)}`)
  }

  try {
    const pair = JSON.parse(rawText) as WordPair
    if (pair.civilian && pair.spy) return pair
    throw new Error(`Missing keys in: ${JSON.stringify(pair)}`)
  } catch (e) {
    // Try extracting JSON block as last resort
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/)
    if (jsonMatch) {
      const pair = JSON.parse(jsonMatch[0]) as WordPair
      if (pair.civilian && pair.spy) return pair
    }
    throw new Error(`Could not parse JSON from: ${JSON.stringify(rawText)}`)
  }
}

export async function generateWordPair(): Promise<WordPair> {
  const apiKey = process.env.GEMINI_API_KEY
  const useFallback = process.env.USE_FALLBACK_WORDS === 'true'

  if (!useFallback && apiKey) {
    try {
      return await generateFromGemini(apiKey)
    } catch (e) {
      console.error('Gemini word generation failed:', (e as Error).message)
      throw e // don't silently fall back — surface the error
    }
  }

  if (useFallback) {
    console.log('USE_FALLBACK_WORDS=true, using fallback word pair')
    return getFallbackWordPair()
  }

  throw new Error('GEMINI_API_KEY is not set and USE_FALLBACK_WORDS is not true')
}
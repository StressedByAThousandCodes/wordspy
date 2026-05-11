export interface WordPair {
  civilian: string
  spy: string
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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

async function generateFromGemini(apiKey: string): Promise<WordPair> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 500,
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
      // Disable thinking for structured output — thinking models
      // return reasoning tokens separately which breaks JSON parsing
      thinkingConfig: {
        thinkingBudget: 0,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${err}`)
  }

  const data = await response.json()

  // gemini-2.5-flash may return multiple parts — find the non-thought one
  const parts: any[] = data.candidates?.[0]?.content?.parts ?? []
  console.log('Gemini parts count:', parts.length)

  // Filter out thinking parts (they have a "thought: true" flag)
  const textPart = parts.find((p: any) => !p.thought && p.text) ?? parts[0]
  const rawText: string = textPart?.text ?? ''

  console.log('Gemini raw text:', JSON.stringify(rawText))
  console.log('Finish reason:', data.candidates?.[0]?.finishReason)

  if (!rawText) {
    throw new Error(
      `Empty response from Gemini. Full: ${JSON.stringify(data).slice(0, 500)}`
    )
  }

  // Try direct parse first (responseMimeType + responseSchema should give clean JSON)
  try {
    const pair = JSON.parse(rawText) as WordPair
    if (pair.civilian && pair.spy) return pair
    throw new Error(`Missing keys: ${JSON.stringify(pair)}`)
  } catch {
    // Last resort — extract JSON block
    const match = rawText.match(/\{[\s\S]*?\}/)
    if (match) {
      const pair = JSON.parse(match[0]) as WordPair
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
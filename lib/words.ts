export interface WordPair {
  civilian: string
  spy: string
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

const PROMPT = `You are a word game designer. Generate a word pair for a spy guessing game.
Return ONLY a valid JSON object with exactly two keys: "civilian" and "spy".
- "civilian": a common everyday noun players will describe
- "spy": a different but related word close enough to be confusing
- Both must be concrete nouns, easy to describe in one sentence
- No proper nouns, brand names, or obscure words
Example: {"civilian":"piano","spy":"guitar"}
Return ONLY the JSON. No explanation, no markdown, no backticks.`

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
]

function getFallbackWordPair(): WordPair {
  return FALLBACK_WORD_PAIRS[Math.floor(Math.random() * FALLBACK_WORD_PAIRS.length)]
}

async function generateFromGemini(apiKey: string): Promise<WordPair> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 100 },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const clean = text.replace(/```json|```/g, '').trim()
  const pair = JSON.parse(clean) as WordPair
  if (!pair.civilian || !pair.spy) throw new Error('Invalid shape')
  return pair
}

export async function generateWordPair(): Promise<WordPair> {
  const apiKey = process.env.GEMINI_API_KEY

  if (apiKey) {
    try {
      return await generateFromGemini(apiKey)
    } catch (e) {
      console.warn('Gemini word generation failed, using fallback:', (e as Error).message)
    }
  } else {
    console.warn('GEMINI_API_KEY not set, using fallback word pair')
  }

  return getFallbackWordPair()
}
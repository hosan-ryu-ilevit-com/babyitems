require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('API Key가 없습니다.');

const ai = new GoogleGenAI({ apiKey });

async function test() {
  console.log('=== Test 1: ai.models.get() ===');
  try {
    const model = ai.models.get('gemini-flash-latest');
    console.log('Model type:', typeof model);
    console.log('Model methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)));
  } catch (err) {
    console.error('Error:', err.message);
  }

  console.log('\n=== Test 2: ai.models.generateContent() directly ===');
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
      config: { temperature: 0.3 }
    });
    console.log('Result type:', typeof result);
    console.log('Response:', result.response?.text ? result.response.text() : 'No text method');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test().catch(console.error);

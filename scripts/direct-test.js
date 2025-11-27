require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('API Key가 없습니다.');

const ai = new GoogleGenAI({ apiKey });

console.log('=== Checking if getGenerativeModel exists ===');
console.log('Type of ai.getGenerativeModel:', typeof ai.getGenerativeModel);

if (typeof ai.getGenerativeModel === 'function') {
  console.log('✅ Method exists! Testing...\n');

  async function test() {
    try {
      const model = ai.getGenerativeModel({
        model: 'gemini-flash-latest',
        config: { temperature: 0.3 }
      });

      console.log('Model created:', typeof model);

      const result = await model.generateContent('Say hello');
      console.log('Response:', result.response.text());
    } catch (err) {
      console.error('Error:', err.message);
      console.error('Stack:', err.stack);
    }
  }

  test();
} else {
  console.log('❌ Method does not exist');
  console.log('\nAvailable properties on ai:');
  console.log(Object.getOwnPropertyNames(ai));
  console.log('\nAvailable methods on ai prototype:');
  console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(ai)));
}

const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: 'test' });

console.log('\n=== GoogleGenAI instance properties ===');
console.log(Object.keys(ai));

console.log('\n=== ai.models methods ===');
if (ai.models) {
  console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(ai.models)));

  // Try to call generateContent
  console.log('\n=== Testing ai.models.generateContent ===');
  console.log('Type:', typeof ai.models.generateContent);
}

console.log('\n=== Checking for get/generate methods ===');
const allMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(ai.models));
const genMethods = allMethods.filter(m => m.includes('gen') || m.includes('get'));
console.log('Found methods:', genMethods);

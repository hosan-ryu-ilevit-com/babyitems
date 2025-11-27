const fetch = require('node-fetch');

async function testAnalyzeAPI() {
  console.log('🧪 Testing /api/analyze-reviews endpoint...\n');

  const testProduct = {
    productId: '5720622178',
    productTitle: '스와비넥스 메모리즈 포레스트 안심 120ml',
    category: 'baby_bottle'
  };

  console.log(`📦 Test Product:`, testProduct);
  console.log();

  try {
    const startTime = Date.now();

    const response = await fetch('http://localhost:3000/api/analyze-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testProduct)
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Error:', error);
      return;
    }

    const result = await response.json();

    console.log(`✅ API Response (${elapsed}ms):\n`);
    console.log(`Success: ${result.success}`);
    console.log(`Product ID: ${result.productId}`);
    console.log(`Product Title: ${result.productTitle}`);
    console.log(`Category: ${result.category}`);
    console.log(`Review Count: ${result.reviewCount}`);
    console.log(`Processing Time:`, result.processingTime);
    console.log();

    // Check pros
    console.log(`📈 Pros (${result.summary.pros.length}):`);
    result.summary.pros.forEach((pro, idx) => {
      console.log(`  ${idx + 1}. ${pro.text}`);
      console.log(`     Citation: "${pro.citation}"`);
      console.log(`     Review Index: ${pro.reviewIndex} ${pro.reviewIndex ? '✅' : '❌ MISSING!'}`);
      console.log();
    });

    // Check cons
    console.log(`📉 Cons (${result.summary.cons.length}):`);
    result.summary.cons.forEach((con, idx) => {
      console.log(`  ${idx + 1}. ${con.text}`);
      console.log(`     Citation: "${con.citation}"`);
      console.log(`     Review Index: ${con.reviewIndex} ${con.reviewIndex ? '✅' : '❌ MISSING!'}`);
      console.log();
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAnalyzeAPI();

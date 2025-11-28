/**
 * Remove duplicate productIds in spec JSON files
 * Strategy: Keep only the product with the most reviews for each duplicate productId
 */

const fs = require('fs');
const path = require('path');

const SPECS_DIR = path.join(process.cwd(), 'data', 'specs');
const REVIEWS_DIR = path.join(process.cwd(), 'data', 'reviews');

// Categories to process
const CATEGORIES = [
  'baby_bottle',
  'baby_bottle_sterilizer',
  'baby_formula_dispenser',
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'milk_powder_port',
  'nasal_aspirator',
  'thermometer',
];

/**
 * Get review count for a product from review JSON files
 */
function getReviewCount(category, productId) {
  const reviewFilePath = path.join(REVIEWS_DIR, category, `${productId}.json`);

  if (!fs.existsSync(reviewFilePath)) {
    return 0;
  }

  try {
    const reviewContent = fs.readFileSync(reviewFilePath, 'utf-8');
    const reviews = JSON.parse(reviewContent);
    return Array.isArray(reviews) ? reviews.length : 0;
  } catch (error) {
    console.error(`   ⚠️  Error reading reviews for ${productId}:`, error.message);
    return 0;
  }
}

/**
 * Select the best product from duplicates
 * Priority: 1. Most reviews, 2. Best ranking (lowest 순위), 3. First in array
 */
function selectBestProduct(products, category) {
  if (products.length === 1) {
    return products[0];
  }

  // Add review counts
  const productsWithReviews = products.map(product => ({
    ...product,
    _reviewCount: getReviewCount(category, product.productId),
  }));

  // Sort by: reviewCount (desc), 순위 (asc), array index
  productsWithReviews.sort((a, b) => {
    // First: most reviews
    if (b._reviewCount !== a._reviewCount) {
      return b._reviewCount - a._reviewCount;
    }

    // Second: best ranking (lower is better)
    const rankA = a.순위 ?? 999999;
    const rankB = b.순위 ?? 999999;
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Third: keep original order (stable)
    return 0;
  });

  const best = productsWithReviews[0];
  delete best._reviewCount;
  return best;
}

/**
 * Process a single spec file
 */
function processSpecFile(category) {
  const filePath = path.join(SPECS_DIR, `${category}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${category}.json`);
    return { removed: 0, kept: 0 };
  }

  console.log(`\n📄 Processing ${category}.json...`);

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const products = JSON.parse(fileContent);

  // Group products by productId
  const productIdMap = new Map();
  products.forEach((product, index) => {
    const id = product.productId;
    if (!productIdMap.has(id)) {
      productIdMap.set(id, []);
    }
    productIdMap.get(id).push({ ...product, _originalIndex: index });
  });

  // Find duplicates and select best
  let duplicatesRemoved = 0;
  const keptProducts = [];

  for (const [productId, productList] of productIdMap.entries()) {
    if (productList.length > 1) {
      // Has duplicates
      console.log(`\n   🔍 Found ${productList.length} products with ID: ${productId}`);

      productList.forEach((p, idx) => {
        const reviewCount = getReviewCount(category, productId);
        console.log(`      ${idx + 1}. ${p.브랜드} ${p.모델명} (순위: ${p.순위 ?? 'N/A'}, 리뷰: ${reviewCount}개)`);
      });

      const best = selectBestProduct(productList, category);
      const bestReviewCount = getReviewCount(category, productId);
      console.log(`      ✅ Keeping: ${best.브랜드} ${best.모델명} (리뷰: ${bestReviewCount}개)`);

      keptProducts.push(best);
      duplicatesRemoved += productList.length - 1;
    } else {
      // No duplicates
      keptProducts.push(productList[0]);
    }
  }

  // Sort by original index to maintain order
  keptProducts.sort((a, b) => (a._originalIndex ?? 0) - (b._originalIndex ?? 0));

  // Clean up temporary fields
  keptProducts.forEach(p => delete p._originalIndex);

  // Write back to file
  fs.writeFileSync(
    filePath,
    JSON.stringify(keptProducts, null, 2),
    'utf-8'
  );

  console.log(`\n   📊 Summary:`);
  console.log(`      Original: ${products.length} products`);
  console.log(`      Kept: ${keptProducts.length} products`);
  console.log(`      Removed: ${duplicatesRemoved} duplicates`);

  return { removed: duplicatesRemoved, kept: keptProducts.length };
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Removing duplicate productIds (keeping products with most reviews)...\n');
  console.log('=' .repeat(60));

  let totalRemoved = 0;
  let totalKept = 0;

  for (const category of CATEGORIES) {
    try {
      const result = processSpecFile(category);
      totalRemoved += result.removed;
      totalKept += result.kept;

      // Verify no duplicates remain
      const filePath = path.join(SPECS_DIR, `${category}.json`);
      const products = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const ids = products.map(p => p.productId);
      const uniqueIds = new Set(ids);

      if (ids.length !== uniqueIds.size) {
        console.error(`\n   ❌ ERROR: Still has duplicates in ${category}.json!`);
      } else {
        console.log(`   ✅ Verified: No duplicates in ${category}.json`);
      }
    } catch (error) {
      console.error(`\n   ❌ Error processing ${category}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Duplicate removal completed!\n');
  console.log(`📊 Total Results:`);
  console.log(`   - Products kept: ${totalKept}`);
  console.log(`   - Duplicates removed: ${totalRemoved}`);
  console.log('\n⚠️  IMPORTANT: Review changes before committing!');
}

main();

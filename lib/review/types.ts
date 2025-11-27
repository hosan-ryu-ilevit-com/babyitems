// Review data types

export interface Review {
  text: string;
  custom_metadata: {
    productId: string;
    category: string;
    rating: number;
  };
}

export interface SampledReview extends Review {
  length: number;
  index: number; // Original index in the full review list
}

export interface ReviewSummary {
  pros: Array<{
    text: string;
    citation: string;
    reviewIndex: number;
  }>;
  cons: Array<{
    text: string;
    citation: string;
    reviewIndex: number;
  }>;
}

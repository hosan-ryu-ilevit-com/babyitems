'use client';

import { useState, useEffect } from 'react';
import { FavoritesState } from '@/types';

const FAVORITES_KEY = 'babyitem_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        const parsed: FavoritesState = JSON.parse(stored);
        setFavorites(parsed.productIds);
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save favorites to localStorage whenever it changes
  const saveFavorites = (newFavorites: string[]) => {
    try {
      const state: FavoritesState = {
        productIds: newFavorites,
        timestamp: Date.now(),
      };
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(state));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  };

  const toggleFavorite = (productId: string) => {
    if (favorites.includes(productId)) {
      // Remove from favorites
      saveFavorites(favorites.filter((id) => id !== productId));
    } else {
      // Add to favorites (unlimited)
      saveFavorites([...favorites, productId]);
    }
    return true;
  };

  const removeFavorite = (productId: string) => {
    saveFavorites(favorites.filter((id) => id !== productId));
  };

  const clearFavorites = () => {
    saveFavorites([]);
  };

  const isFavorite = (productId: string) => {
    return favorites.includes(productId);
  };

  return {
    favorites,
    isLoaded,
    toggleFavorite,
    removeFavorite,
    clearFavorites,
    isFavorite,
    count: favorites.length,
  };
}

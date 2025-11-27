// Product spec data utilities - centralized exports
// NOTE: This file is client-safe (no Node.js dependencies)
// For server-side spec loading, import from './specLoader' directly

export * from './constants';
export * from './types';

// DO NOT export specLoader here - it uses Node.js 'fs' module
// Import it directly in server components/API routes:
// import { getSpecsByCategory } from '@/lib/data/specLoader';

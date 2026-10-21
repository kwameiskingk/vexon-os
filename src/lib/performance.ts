import React from 'react';

// Performance optimization utilities

// Debounce function for search inputs and API calls
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function for scroll events
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Memoization for expensive calculations
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

// Lazy load components
export const lazyWithPreload = (factory: () => Promise<{ default: React.ComponentType<any> }>) => {
  const LazyComponent = React.lazy(factory);
  // @ts-ignore
  LazyComponent.preload = factory;
  return LazyComponent;
};

// Image optimization helper
export function getOptimizedImageUrl(url: string, width?: number): string {
  if (!url) return url;
  
  // For Supabase storage URLs, we can add transform parameters
  if (url.includes('supabase')) {
    const params = new URLSearchParams();
    if (width) params.set('width', width.toString());
    params.set('quality', '80');
    return `${url}?${params.toString()}`;
  }
  
  return url;
}

// Virtual scrolling helper for large lists
export function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalItems: number
): { start: number; end: number } {
  const start = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const end = Math.min(start + visibleCount + 1, totalItems);
  
  return { start: Math.max(0, start - 1), end };
}

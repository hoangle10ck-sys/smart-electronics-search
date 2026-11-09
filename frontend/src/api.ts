export interface Product {
  _id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  description: string;
  specs: Record<string, string | number>;
  tags: string[];
  rating: number;
  sold: number;
  stock: number;
  score?: number;
  reasons?: string[];
}

export interface Intent {
  category?: string;
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  ram?: number;
  tags: string[];
  keywords: string[];
}

export interface SearchResponse {
  query: string;
  intent: Intent;
  notes: string[];
  total: number;
  items: Product[];
}

export interface Suggestion {
  _id: string;
  name: string;
  category: string;
}

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function searchProducts(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/products/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error('Không tìm kiếm được, kiểm tra backend đã chạy chưa.');
  return res.json();
}

export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/products/suggest?q=${encodeURIComponent(q)}`, { signal });
  return res.ok ? res.json() : [];
}

export const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export const formatShort = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)} triệu` : `${Math.round(n / 1e3)}k`;

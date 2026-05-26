/**
 * FoodRecognitionService
 *
 * Client-side service that:
 *   1. Compresses and uploads images to Supabase Storage
 *   2. Proxies FatSecret API calls through our Supabase Edge Function
 *      (the Consumer Key/Secret never touch the browser)
 *   3. Parses raw FatSecret responses into typed DetectedFood objects
 *
 * The edge function at supabase/functions/food-scan/index.ts handles OAuth 1.0a signing.
 */

import { supabase } from '../lib/supabase';
import type {
  DetectedFood,
  FatSecretFoodEntry,
  FatSecretFood,
  FatSecretServing,
  FatSecretRecognizeResponse,
  FatSecretSearchResponse,
  FatSecretFoodResponse,
} from '../features/food/types';

// ─── Image processing (client-side Canvas) ────────────────────────────────

function calcDims(
  w: number, h: number, maxW: number, maxH: number,
): { width: number; height: number } {
  if (w <= maxW && h <= maxH) return { width: w, height: h };
  const r = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * r), height: Math.round(h * r) };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/** Resize + compress an image file. Returns a JPEG Blob ≤ maxW×maxH at given quality. */
export async function compressImage(
  file: File,
  maxW = 800,
  maxH = 800,
  quality = 0.85,
): Promise<Blob> {
  const img = await fileToImage(file);
  const { width, height } = calcDims(img.naturalWidth, img.naturalHeight, maxW, maxH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Square-crop + resize a file to a thumbnail Blob. */
export async function makeThumbnail(file: File, size = 200): Promise<Blob> {
  const img = await fileToImage(file);
  const { naturalWidth: iw, naturalHeight: ih } = img;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Center-square crop
  const side = Math.min(iw, ih);
  const sx = (iw - side) / 2;
  const sy = (ih - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.80,
    );
  });
}

// ─── Supabase Storage upload ───────────────────────────────────────────────

/** Upload a Blob to the food-scans bucket. Returns the public URL. */
export async function uploadFoodImage(
  userId: string,
  blob: Blob,
  suffix: '_thumb' | '' = '',
): Promise<string> {
  const path = `${userId}/${Date.now()}${suffix}.jpg`;
  const { error } = await supabase.storage
    .from('food-scans')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('food-scans').getPublicUrl(path).data.publicUrl;
}

/** Delete an image from storage given its public URL. Best-effort — never throws. */
export async function deleteFoodImage(publicUrl: string): Promise<void> {
  try {
    // Extract the path after "/food-scans/"
    const marker = '/food-scans/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
    await supabase.storage.from('food-scans').remove([path]);
  } catch { /* silent */ }
}

// ─── Edge-function proxy calls ─────────────────────────────────────────────

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('food-scan', { body });
  if (error) throw error;
  // FatSecret error field in the JSON body
  const d = data as any;
  if (d?.error) throw new Error(d.error.message ?? JSON.stringify(d.error));
  return data as T;
}

// ─── FatSecret parsers ─────────────────────────────────────────────────────

function firstServing(food: FatSecretFood): FatSecretServing | null {
  const s = food.servings?.serving;
  if (!s) return null;
  return Array.isArray(s) ? s[0] : s;
}

function parseServing(
  id: string,
  name: string,
  brand: string | undefined,
  entry: FatSecretFoodEntry | null,
  serving: FatSecretServing,
): DetectedFood {
  return {
    id,
    name,
    brand,
    servingSize:  serving.serving_description ?? '1 serving',
    servingGrams: parseFloat(serving.metric_serving_amount ?? '100') || 100,
    servings:     parseFloat(entry?.number_of_units ?? '1') || 1,
    calories:     parseFloat(serving.calories ?? '0'),
    protein:      parseFloat(serving.protein   ?? '0'),
    carbs:        parseFloat(serving.carbohydrate ?? '0'),
    fat:          parseFloat(serving.fat       ?? '0'),
    fiber:        serving.fiber ? parseFloat(serving.fiber)  : undefined,
    sugar:        serving.sugar ? parseFloat(serving.sugar)  : undefined,
    confidence:   entry?.confidence ? parseFloat(entry.confidence) : undefined,
  };
}

/**
 * Parse compact food_description from foods.search results.
 * Format: "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g"
 */
function parseDescription(desc: string): Pick<DetectedFood, 'calories' | 'protein' | 'carbs' | 'fat'> {
  const num = (label: string): number => {
    const m = new RegExp(`${label}:\\s*([\\d.]+)`, 'i').exec(desc);
    return m ? parseFloat(m[1]) : 0;
  };
  return {
    calories: num('Calories'),
    protein:  num('Protein'),
    carbs:    num('Carbs'),
    fat:      num('Fat'),
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Recognize foods in an already-uploaded image URL.
 * Requires FatSecret Premier plan — falls back to empty array on 403/not-available errors.
 */
export async function recognizeFood(imageUrl: string): Promise<DetectedFood[]> {
  const raw = await invoke<FatSecretRecognizeResponse>({ action: 'recognize', imageUrl });
  const entries = raw.food_entries?.food_entry;
  if (!entries) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.flatMap((entry): DetectedFood[] => {
    const food = entry.food;
    if (!food) return [];
    const serving = firstServing(food);
    if (!serving) return [];
    return [parseServing(entry.food_id, entry.food_entry_name ?? food.food_name, food.brand_name, entry, serving)];
  });
}

/**
 * Search FatSecret by text query. Returns up to 15 results.
 */
export async function searchFood(query: string): Promise<DetectedFood[]> {
  const raw = await invoke<FatSecretSearchResponse>({ action: 'search', query });
  const foods = raw.foods?.food;
  if (!foods) return [];
  const list = Array.isArray(foods) ? foods : [foods];
  return list.flatMap((food): DetectedFood[] => {
    // Search results may lack detailed servings; fall back to food_description
    const serving = firstServing(food);
    if (serving) {
      return [parseServing(food.food_id, food.food_name, food.brand_name, null, serving)];
    }
    if (food.food_description) {
      const macros = parseDescription(food.food_description);
      return [{
        id:           food.food_id,
        name:         food.food_name,
        brand:        food.brand_name,
        servingSize:  '100g',
        servingGrams: 100,
        servings:     1,
        ...macros,
      }];
    }
    return [];
  });
}

/**
 * Fetch full nutritional details for a single food by its FatSecret ID.
 */
export async function getFoodDetails(foodId: string): Promise<DetectedFood | null> {
  const raw = await invoke<FatSecretFoodResponse>({ action: 'get_food', foodId });
  const food = raw.food;
  if (!food) return null;
  const serving = firstServing(food);
  if (!serving) return null;
  return parseServing(food.food_id, food.food_name, food.brand_name, null, serving);
}

// ─── Nutrition aggregation ─────────────────────────────────────────────────

/** Calculate totals across all detected foods (respecting per-food servings count). */
export function calcTotals(foods: DetectedFood[]): {
  total_calories: number;
  total_protein:  number;
  total_carbs:    number;
  total_fat:      number;
} {
  return foods.reduce(
    (acc, f) => ({
      total_calories: acc.total_calories + Math.round(f.calories * f.servings),
      total_protein:  acc.total_protein  + parseFloat((f.protein  * f.servings).toFixed(1)),
      total_carbs:    acc.total_carbs    + parseFloat((f.carbs    * f.servings).toFixed(1)),
      total_fat:      acc.total_fat      + parseFloat((f.fat      * f.servings).toFixed(1)),
    }),
    { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 },
  );
}

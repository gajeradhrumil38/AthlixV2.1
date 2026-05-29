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

import { supabase } from '../../../lib/supabase';
import type {
  DetectedFood,
  FatSecretFoodEntry,
  FatSecretFood,
  FatSecretServing,
  FatSecretRecognizeResponse,
  FatSecretSearchResponse,
  FatSecretFoodResponse,
} from '../types';

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

// ─── Gemini Vision helpers ─────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function extractJsonFromText(text: string): unknown {
  // Strip markdown code fences if Gemini wraps the output
  const stripped = text.replace(/```(?:json)?\n?/gi, '').trim();
  return JSON.parse(stripped);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Identify foods using Gemini Vision, then look up nutrition via FatSecret foods.search.
 * Reads the API key from localStorage('athlix:gemini_api_key') — set via Settings → AI Chat.
 */
export async function recognizeFoodWithGemini(imageFile: File): Promise<DetectedFood[]> {
  const apiKey = localStorage.getItem('athlix:gemini_api_key');
  if (!apiKey) throw new Error('Gemini API key not set. Add it in Settings → AI Chat.');

  const model = localStorage.getItem('athlix:gemini_model') || 'gemini-1.5-flash';
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  const prompt =
    'Identify every distinct food item visible in this image. ' +
    'Return ONLY a JSON array, no extra text:\n' +
    '[{"name":"<specific food name>","servings":<number>,"portionNote":"<brief size>"}]\n' +
    'Guidelines:\n' +
    '- name: specific enough for a nutrition DB search (e.g. "grilled chicken breast" not "chicken")\n' +
    '- servings: decimal estimate (0.5, 1, 1.5, 2 …)\n' +
    '- portionNote: e.g. "medium fillet", "1 cup cooked", "2 slices"\n' +
    'Return [] if no food is visible.';

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini: ${errText}`);
  }

  const json = await resp.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let items: Array<{ name: string; servings: number; portionNote?: string }> = [];
  try {
    const parsed = extractJsonFromText(text);
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* unparseable → treat as no foods */ }

  if (items.length === 0) return [];

  // Look up nutrition for each identified food via FatSecret free search
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const matches = await searchFood(item.name);
        if (matches.length === 0) return null;
        const food: DetectedFood = { ...matches[0] };
        food.servings = Math.max(0.5, Math.round((item.servings ?? 1) * 2) / 2);
        if (item.portionNote) food.servingSize = item.portionNote;
        return food;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((r): r is DetectedFood => r !== null);
}

/**
 * Recognize foods in an already-uploaded image URL via FatSecret.
 * Requires FatSecret Premier plan — kept for reference but not used by the scanner.
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

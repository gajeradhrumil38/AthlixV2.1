// ─── Detected food item (one entry in a scan) ─────────────────────────────

export interface DetectedFood {
  id: string;           // FatSecret food_id
  name: string;
  brand?: string;
  servingSize: string;  // e.g. "1 cup (240ml)"
  servingGrams: number; // grams per serving unit
  servings: number;     // quantity the user consumed (editable)
  calories: number;     // kcal per serving
  protein: number;      // g per serving
  carbs: number;        // g per serving
  fat: number;          // g per serving
  fiber?: number;
  sugar?: number;
  confidence?: number;  // 0–1 from image recognition
}

// ─── Persisted scan row ────────────────────────────────────────────────────

export interface FoodScan {
  id: string;
  user_id: string;
  image_url: string | null;
  thumbnail_url: string | null;
  scan_date: string;
  foods_detected: DetectedFood[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  created_at: string;
}

export interface FoodScanInsert {
  image_url?: string | null;
  thumbnail_url?: string | null;
  foods_detected: DetectedFood[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export interface FoodScanUpdate {
  foods_detected?: DetectedFood[];
  total_calories?: number;
  total_protein?: number;
  total_carbs?: number;
  total_fat?: number;
}

// ─── FatSecret raw API shapes ──────────────────────────────────────────────

export interface FatSecretServing {
  serving_id: string;
  serving_description: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  measurement_description?: string;
  calories: string;
  carbohydrate: string;
  protein: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  saturated_fat?: string;
  sodium?: string;
}

export interface FatSecretFood {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type?: 'Brand' | 'Generic';
  servings?: {
    serving: FatSecretServing | FatSecretServing[];
  };
  // Compact fields present in foods.search results
  food_description?: string; // e.g. "Per 100g - Calories: 52kcal | Fat: 0.17g ..."
}

export interface FatSecretFoodEntry {
  food_id: string;
  food_entry_name: string;
  confidence?: string;
  number_of_units?: string;
  serving_id?: string;
  food?: FatSecretFood;
}

export interface FatSecretRecognizeResponse {
  food_entries?: {
    food_entry: FatSecretFoodEntry | FatSecretFoodEntry[];
  };
  error?: { code: string; message: string };
}

export interface FatSecretSearchResponse {
  foods?: {
    food: FatSecretFood | FatSecretFood[];
    total_results?: string;
    max_results?: string;
    page_number?: string;
  };
  error?: { code: string; message: string };
}

export interface FatSecretFoodResponse {
  food?: FatSecretFood;
  error?: { code: string; message: string };
}

// ─── UI state ──────────────────────────────────────────────────────────────

export type ScanStep =
  | 'idle'
  | 'previewing'
  | 'uploading'
  | 'recognizing'
  | 'calculating'
  | 'done'
  | 'error';

export type ScanSource = 'camera' | 'gallery';

export interface ScanState {
  step: ScanStep;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  uploadedImageUrl: string | null;
  uploadedThumbUrl: string | null;
  foods: DetectedFood[];
  error: string | null;
}

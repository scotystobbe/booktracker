export interface Book {
  id: string;
  title: string;
  author: string;
  duration: number; // decimal number (e.g., 8.5 hours)
  start_date: string; // ISO date string
  finish_date: string; // ISO date string, required
  reading_speed: number; // required
  cover_url: string; // Original URL
  local_cover_path?: string; // Local file path
  percent_complete: number; // 0-100, required
}

export interface CreateBookData {
  title: string;
  author: string;
  duration: number;
  start_date: string;
  finish_date?: string; // optional for new books
  reading_speed: number; // required
  cover_url: string;
  local_cover_path?: string; // optional, will be generated
  percent_complete?: number; // optional, defaults to 0 for new books
}

export interface UpdateBookData {
  title?: string;
  author?: string;
  duration?: number;
  start_date?: string;
  finish_date?: string;
  reading_speed?: number;
  cover_url?: string;
  local_cover_path?: string;
  percent_complete?: number;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  paid: string; // 'SI' or 'NO'
  imageUrl?: string; // Optional URL from the sheet or overrides
  [key: string]: any;
}

export interface CardData {
  id: string;
  name: string;
  expiry: number; // Timestamp
  imageUrl?: string; // The specific image to render
}

export interface GoogleSheetConfig {
  url: string;
}
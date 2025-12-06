export interface Member {
  id: string;
  name: string;
  phone: string;
  paid: string; // 'SI' or 'NO'
  imageUrl?: string; // Optional URL from the sheet or overrides
  history?: string[]; // Array of strings representing previous wins imported from the sheet
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

export interface MatchHistoryRecord {
  id: string;
  date: number;
  matchName: string;
  season?: string; // Ej: "24/25", "25/26"
  isCycleReset?: boolean; // Indicates if the exclusion cycle was reset during this raffle
  winners: Member[];
  reserves: Member[];
}
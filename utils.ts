import { CardData } from './types';

// Simple CSV Parser
export const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let match;
    const regex = /(?:,|^)(?:"([^"]*)"|([^",]*))/g;
    while ((match = regex.exec(line)) !== null && values.length < headers.length) {
       values.push(match[1] || match[2] || '');
    }

    const entry: Record<string, string> = {};
    headers.forEach((h, i) => {
      entry[h] = values[i] ? values[i].trim() : '';
    });
    return entry;
  });
};

// URL Base64 Encoding/Decoding
export const encodeCardData = (data: CardData): string => {
  const json = JSON.stringify(data);
  // We use encodeURIComponent before btoa to handle UTF-8 characters (like Ñ, accents) correctly in Base64
  return btoa(encodeURIComponent(json)); 
};

export const decodeCardData = (encoded: string): CardData | null => {
  try {
    if (!encoded) return null;
    
    // 1. Fix common URL encoding artifacts (spaces instead of pluses)
    let safeEncoded = encoded.replace(/ /g, '+');
    
    // 2. Decode standard URI encoding artifacts if present (e.g. %3D instead of =)
    // If the string contains %, it's likely URI encoded.
    if (safeEncoded.includes('%')) {
        try {
            safeEncoded = decodeURIComponent(safeEncoded);
        } catch (e) {
            // If decodeURIComponent fails, continue with original
        }
    }

    // 3. Base64 decode -> URI Decode -> JSON Parse
    // Note: We use decodeURIComponent inside because the original JSON was URI encoded before b64
    const json = decodeURIComponent(atob(safeEncoded));
    return JSON.parse(json);
  } catch (e) {
    console.error("Failed to decode card data", e);
    return null;
  }
};

// ROBUST URL PARAM EXTRACTOR
export const getCardDataFromUrl = (): string | null => {
  const href = window.location.href;
  
  // Strategy 1: Look for ?data= or &data= in the whole string (hash or search)
  // This Regex looks for 'data=' followed by any characters that are NOT '&' or '#'
  const match = href.match(/[?&]data=([^&#]*)/);
  if (match && match[1]) {
      return match[1];
  }
  
  return null;
};

export const generateWhatsAppLink = (phone: string, text: string) => {
  // Limpiar caracteres no numéricos
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Corrección inteligente para números de España:
  // Si tiene 9 dígitos y empieza por 6, 7 (móviles) o 9, 8 (fijos/otros), asumimos que falta el prefijo 34.
  // Esto soluciona el bug de que WhatsApp web/app no detecte el número si no tiene código de país.
  if (cleanPhone.length === 9 && /^[6789]/.test(cleanPhone)) {
      cleanPhone = `34${cleanPhone}`;
  }

  const encodedText = encodeURIComponent(text);
  
  // CAMBIO CRÍTICO: Usar api.whatsapp.com en lugar de wa.me.
  // wa.me suele fallar en la codificación de emojis (Unicode) al redirigir a WhatsApp Web/Desktop.
  // La API completa gestiona correctamente los caracteres especiales en todas las plataformas.
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
};

export const getExpirationDate = (): number => {
  // 4 days * 24 hours * 60 minutes * 60 seconds * 1000 ms
  return Date.now() + (4 * 24 * 60 * 60 * 1000);
};

export const isExpired = (timestamp: number): boolean => {
  return Date.now() > timestamp;
};
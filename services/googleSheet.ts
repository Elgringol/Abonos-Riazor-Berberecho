import { Member } from '../types';
import { parseCSV } from '../utils';

// URL de la hoja publicada (Pestaña específica vía GID=991040855)
const SHEET_ID = '2PACX-1vTpvAQ9nLTEZ1jcFFW3npN8rbxi0jTR6nRPT3sR5r25wO1ZOc7dQNBYm7n_zrAyGooKO6s8FCj_fskq';
const GID = '991040855';
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${GID}&single=true&output=csv`;

export const DEFAULT_IMAGES = [
  "https://drive.google.com/file/d/19GnkjVFkIVumPCP82vNLtw3KSlUlmmQp/view?usp=drivesdk",
  "https://drive.google.com/file/d/1w-xb5fbA1VFx2cL6h71qYTg6SHhMVyFv/view?usp=drivesdk",
  "https://drive.google.com/file/d/1WwInvzBVjlN0lKn1Qj_0EN5nCn3AFKzS/view?usp=drivesdk",
  "https://drive.google.com/file/d/1ya69kWqk5I51rZi3b3segCSlguJvROqS/view?usp=drivesdk",
  "https://drive.google.com/file/d/1OKgnXQiRIHdOYhzHkN2xHekhJhZJ2UI2/view?usp=drivesdk",
  "https://drive.google.com/file/d/1o8O3jrNVUh1WqvJCFslzorKJssnDQlI2/view?usp=drivesdk",
  "https://drive.google.com/file/d/1Xk0XDbU9YrScl5KE4NudYyddRA0mvO_O/view?usp=drivesdk",
  "https://drive.google.com/file/d/11hWN3SIEc-i2BoaM5gv0vxxjWBevY9WE/view?usp=drivesdk",
  "https://drive.google.com/file/d/14cT5cd4vz81cSb4aeB0upPsctTOFKEOq/view?usp=drivesdk",
  "https://drive.google.com/file/d/1bvol3kzgyV601iwDNJUceokAgK-i6Ekw/view?usp=drivesdk"
];

/**
 * Procesa una línea de CSV respetando comillas para celdas que contienen comas.
 */
const parseCSVLine = (line: string): string[] => {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuote = !inQuote;
    else if (char === ',' && !inQuote) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else cur += char;
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
};

export const fetchMembers = async (): Promise<Member[]> => {
  try {
    const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Error fetching sheet: ${response.statusText}`);
    }
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) return [];

    // Omitimos la cabecera y procesamos cada fila
    return lines.slice(1).map((line, index) => {
        const row = parseCSVLine(line);
        
        /**
         * MAPEADO ESTRICTO POR COLUMNAS:
         * A (0): ID
         * B (1): Nombre Socio
         * C (2): Teléfono
         * D (3): Cuota Pagada (SI o NO)
         * E (4): Socio Ganador en jornadas anteriores
         * F (5): Partido Ganador
         */
        
        const id = row[0] || `S-${index}`;
        const name = row[1] || 'Socio Desconocido';
        const phone = row[2] || '';
        
        // --- COLUMNA D: ESTADO DE PAGO ---
        const rawPaid = (row[3] || '').toUpperCase();
        const isPaid = rawPaid === 'SI' || rawPaid === 'SÍ' || rawPaid === 'OK';

        // --- COLUMNAS E y F: HISTORIAL DE GANADORES ---
        const historySet = new Set<string>();
        const colE = (row[4] || '').toUpperCase(); // "SI" o "GANADOR" o "NO"
        const colF = (row[5] || '').trim();         // Nombre del partido (ej: "Real Madrid")

        // Si E indica victoria, añadimos el nombre del partido de F (o de E si F está vacío)
        if (colE === 'SI' || colE === 'SÍ' || (colE.length > 2 && colE !== 'NO')) {
            const matchName = (colF && colF.toUpperCase() !== 'NO' && colF !== '-') 
                ? colF 
                : (colE !== 'SI' && colE !== 'SÍ' ? row[4] : 'Ganador Anterior');
            if (matchName) historySet.add(matchName);
        }

        // --- IMAGEN ---
        // Si hay una columna G (6) la usamos, si no, fallback rotativo
        let imageUrl = row[6] || '';
        if (!imageUrl || !imageUrl.startsWith('http')) {
            imageUrl = DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];
        }

        return {
            id,
            name,
            phone,
            paid: isPaid ? 'SI' : 'NO',
            imageUrl,
            history: Array.from(historySet)
        };
    });
  } catch (error) {
    console.error("Failed to load members from Google Sheets", error);
    return [];
  }
};

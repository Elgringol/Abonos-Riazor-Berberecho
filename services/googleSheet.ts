import { Member } from '../types';
import { parseCSV } from '../utils';

// The URL provided in the prompt.
const SHEET_ID = '2PACX-1vTpvAQ9nLTEZ1jcFFW3npN8rbxi0jTR6nRPT3sR5r25wO1ZOc7dQNBYm7n_zrAyGooKO6s8FCj_fskq';
const GID = '991040855';
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${GID}&single=true&output=csv`;

// Provided Default Images (fallback if sheet column is empty)
// EXPORTED to be used as fixed backgrounds for the 10 slots
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

export const fetchMembers = async (): Promise<Member[]> => {
  try {
    // AÑADIDO: Cache busting (&t=Date.now()) para forzar la descarga de datos frescos
    const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Error fetching sheet: ${response.statusText}`);
    }
    const text = await response.text();
    const rawData = parseCSV(text);

    return rawData.map((row, index) => {
        const keys = Object.keys(row);
        
        // Helper para buscar columnas de forma insensible a mayúsculas/minúsculas
        const findKey = (searchTerms: string[]) => {
            for (const term of searchTerms) {
                const found = keys.find(k => k.toLowerCase().includes(term.toLowerCase()));
                if (found) return found;
            }
            return '';
        };

        // Búsqueda de IMAGEN
        let imgKey = findKey(['imagen', 'foto', 'photo', 'img']);
        let rawImgUrl = imgKey ? row[imgKey] : '';
        
        // Fallback de imagen
        if (!rawImgUrl && index < DEFAULT_IMAGES.length) {
            rawImgUrl = DEFAULT_IMAGES[index];
        } else if (!rawImgUrl) {
             rawImgUrl = DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];
        }

        // --- LÓGICA DE DETECCIÓN DE PAGO ROBUSTA ---
        const paymentKey = findKey(['cuota', 'pagad', 'pago', 'estado', 'status', 'situacion', 'corriente', '2024']);
        const rawPaidValue = paymentKey ? row[paymentKey] : 'NO';
        const cleanPaid = rawPaidValue.replace(/["']/g, '').trim().toUpperCase();
        
        const positiveValues = [
            'SI', 'SÍ', 'S',             
            'YES', 'Y',                  
            'TRUE', 'T', '1',            
            'PAGADO', 'PAGADA',          
            'OK', 'ACTIVO', 'ACTIVA',    
            'AL CORRIENTE', 'COMPLETADO' 
        ];

        const isPaid = positiveValues.some(val => cleanPaid === val || cleanPaid.startsWith(val));

        // --- LÓGICA DE HISTORIAL AVANZADA (MULTICOLUMNA) ---
        // Ahora escaneamos TODAS las columnas en busca de pistas de premios, no solo una.
        const historySet = new Set<string>();

        keys.forEach(key => {
            const lowerKey = key.toLowerCase();
            const value = row[key]?.replace(/["']/g, '').trim();
            const upperValue = value?.toUpperCase();

            if (!value) return;

            // 1. Columnas explícitas de lista ("Historial", "Anteriores")
            if (/historial|anteriores|ganados|history|premios/.test(lowerKey)) {
                 value.split(/[,;]/).forEach(item => {
                     const itemClean = item.trim();
                     if (itemClean && itemClean.toUpperCase() !== 'NO') historySet.add(itemClean);
                 });
            }
            // 2. Columnas individuales de jornada ("Jornada 1", "Ganador Celta", "Partido X")
            // Evitamos la columna de pago y la de nombre/id/telefono
            else if (
                /ganador|winner|premiado|partido|match|jornada|encuentro|vs/.test(lowerKey) &&
                !/nombre|name|apellidos|id|socio|tel|phone|cuota|pago|pagad/.test(lowerKey)
            ) {
                 // Si el valor es positivo (SI, OK) o es un texto descriptivo (ej: "Tribuna", "Entregado")
                 if (positiveValues.includes(upperValue) || value.length > 2) {
                     if (upperValue !== 'NO') {
                         // Si dice "SI", guardamos el nombre de la columna (ej: "Jornada 5")
                         // Si dice "Celta", guardamos "Celta"
                         const historyEntry = (positiveValues.includes(upperValue)) ? key : value;
                         historySet.add(historyEntry);
                     }
                 }
            }
        });

        const historyList = Array.from(historySet);

        return {
            id: row[findKey(['id', 'socio', 'número', 'numero'])] || '0',
            name: row[findKey(['nombre', 'name', 'apellidos'])] || 'Desconocido',
            phone: row[findKey(['teléfono', 'telefono', 'movil', 'phone', 'tfn', 'tfno', 'celular', 'móvil'])] || '',
            paid: isPaid ? 'SI' : 'NO',
            imageUrl: rawImgUrl,
            history: historyList,
            ...row
        };
    });
  } catch (error) {
    console.error("Failed to load members", error);
    return [];
  }
};
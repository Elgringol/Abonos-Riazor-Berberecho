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

        // Búsqueda de IMAGEN (Ya no es estrictamente necesaria para la lógica de slots, pero se mantiene para retrocompatibilidad)
        let imgKey = findKey(['imagen', 'foto', 'photo', 'img']);
        let rawImgUrl = imgKey ? row[imgKey] : '';
        
        // Fallback de imagen
        if (!rawImgUrl && index < DEFAULT_IMAGES.length) {
            rawImgUrl = DEFAULT_IMAGES[index];
        } else if (!rawImgUrl) {
             rawImgUrl = DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];
        }

        // --- LÓGICA DE DETECCIÓN DE PAGO ROBUSTA ---
        // Buscamos cualquier columna que parezca indicar el estado de pago
        const paymentKey = findKey(['cuota', 'pagad', 'pago', 'estado', 'status', 'situacion', 'corriente', '2024']);
        const rawPaidValue = paymentKey ? row[paymentKey] : 'NO';
        
        // Limpiamos el valor: quitamos comillas, espacios y pasamos a mayúsculas
        const cleanPaid = rawPaidValue.replace(/["']/g, '').trim().toUpperCase();
        
        // Lista exhaustiva de valores positivos
        const positiveValues = [
            'SI', 'SÍ', 'S',             // Variantes básicas
            'YES', 'Y',                  // Inglés
            'TRUE', 'T', '1',            // Booleanos/Numéricos
            'PAGADO', 'PAGADA',          // Explícitos
            'OK', 'ACTIVO', 'ACTIVA',    // Estado
            'AL CORRIENTE', 'COMPLETADO' // Frases
        ];

        // Comprobación: ¿Contiene alguna de las palabras positivas?
        // Usamos .some() para que si la celda dice "Si, pagado" también funcione
        const isPaid = positiveValues.some(val => cleanPaid === val || cleanPaid.startsWith(val));

        return {
            id: row[findKey(['id', 'socio', 'número', 'numero'])] || '0',
            name: row[findKey(['nombre', 'name', 'apellidos'])] || 'Desconocido',
            // Ampliamos la búsqueda de teléfono para incluir variantes comunes
            phone: row[findKey(['teléfono', 'telefono', 'movil', 'phone', 'tfn', 'tfno', 'celular', 'móvil'])] || '',
            paid: isPaid ? 'SI' : 'NO',
            imageUrl: rawImgUrl,
            ...row
        };
    });
  } catch (error) {
    console.error("Failed to load members", error);
    return [];
  }
};
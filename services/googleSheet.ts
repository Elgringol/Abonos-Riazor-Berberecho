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
    // Cache busting (&t=Date.now()) para forzar la descarga de datos frescos
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

        // --- LÓGICA DE HISTORIAL AVANZADA (BLACKLIST APPROACH) ---
        const historySet = new Set<string>();

        // Lista negra de columnas que DEFINITIVAMENTE NO son partidos (Metadatos)
        // Usamos regex menos estricto (sin anchors ^$) para capturar variaciones, pero excluiremos explícitamente paymentKey abajo.
        const metaColumnsRegex = /^(id|socio|número|numero|nombre|name|apellidos|teléfono|telefono|movil|phone|tfn|tfno|celular|móvil|cuota|pagad|pago|estado|status|situacion|corriente|2024|imagen|foto|photo|img|timestamp|marca temporal)$/i;

        keys.forEach((key, keyIndex) => {
            const lowerKey = key.toLowerCase();
            const value = row[key]?.replace(/["']/g, '').trim();
            const upperValue = value?.toUpperCase();

            if (!value) return;

            // --- REGLA ESPECÍFICA: COLUMNAS E (Índice 4) y F (Índice 5) ---
            // Solicitud: Si Col E contiene "Ganador", añadir el contenido de Col F al historial de victorias.
            // Ignoramos el valor de E (ej: "Ganador") como texto visible, solo lo usamos de trigger.
            if (keyIndex === 4) { // Columna E (Estado Sorteo)
                 if (String(value).toLowerCase().includes('ganador')) {
                     const matchNameKey = keys[5]; // Columna F (Partido)
                     if (matchNameKey) {
                         const matchName = row[matchNameKey]?.replace(/["']/g, '').trim();
                         if (matchName) historySet.add(matchName);
                     }
                 }
                 // Detenemos procesamiento de esta columna para no añadir "Ganador" o "Reserva" como partido ganado
                 return;
            }

            if (keyIndex === 5) { // Columna F (Nombre Partido)
                // Esta columna solo sirve de dato para la Columna E. La ignoramos en el barrido general 
                // para evitar que se añada si el socio NO es ganador (ej: es Reserva).
                return;
            }
            
            // --- EXCLUSIONES CRÍTICAS ---
            // 1. Si detectamos una columna de pago, LA IGNORAMOS en el historial para no contar "SI" como partido.
            if (paymentKey && key === paymentKey) return;
            // 2. Lo mismo para la imagen
            if (imgKey && key === imgKey) return;
            // 3. Regex general de metadatos
            if (metaColumnsRegex.test(key)) return;


            // --- LÓGICA GENERAL (Para otras columnas históricas G, H... si las hubiera) ---

            // CASO ESPECIAL: Columnas que contienen listas explícitas (ej: "Historial: Partido1, Partido2")
            if (/historial|anteriores|premios/.test(lowerKey)) {
                 value.split(/[,;]/).forEach(item => {
                     const itemClean = item.trim();
                     if (itemClean && itemClean.toUpperCase() !== 'NO') historySet.add(itemClean);
                 });
                 return;
            }

            // CASO GENERAL: Columnas de Partidos Individuales
            // Filtramos valores negativos o vacíos
            if (upperValue === 'NO' || upperValue === '-' || upperValue === 'X') return;

            if (positiveValues.includes(upperValue) || value.length > 0) {
                 // Si el valor es afirmativo estándar (SI, OK), usamos el nombre de la columna.
                 if (positiveValues.includes(upperValue)) {
                     historySet.add(key); 
                 } 
                 // Si el valor es texto, asumimos que es el nombre del premio/partido.
                 else {
                     historySet.add(value);
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
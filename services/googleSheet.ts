import { Member } from '../types';

// URL de la nueva hoja publicada de la temporada 2026/2027
const SHEET_ID = '2PACX-1vTzpcKXqDbkpJmKZQ-ZubCORPGyqFS_MsoqGWViel1lDwhTQu-5Saz9RiSqQMSq7moROwnCwCYA2TOt';
const GID = '484157534';
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${GID}&single=true&output=csv`;

export const DEFAULT_IMAGES = [
  "https://drive.google.com/file/d/11inxZ7ldwzzFp3VBqiYogIrzwyMbMbk2/view?usp=drive_link",
  "https://drive.google.com/file/d/1RHS5tGNBCbHAD7DuZgfe-mB_7qJO-Uq-/view?usp=drive_link",
  "https://drive.google.com/file/d/17RF-EjtVfOmnqnvIueaoj_FBnyEpRjln/view?usp=drive_link",
  "https://drive.google.com/file/d/1k-Yk6YS0pA8_GYauUQR7KURZzqcHawE4/view?usp=drive_link",
  "https://drive.google.com/file/d/1vIIR4DkbvgWjUTUeYJRhBlgWX8sfHuFX/view?usp=drive_link",
  "https://drive.google.com/file/d/13tklkf0fR48UYqogP1o5GzyEQbFxv6_E/view?usp=drive_link",
  "https://drive.google.com/file/d/1XW3eA8oAEAPMfer-QBZoxrsEtiPLyCZr/view?usp=drive_link",
  "https://drive.google.com/file/d/13cdnvttXfbBgU7--cM_lbs3jwfbWMfCy/view?usp=drive_link",
  "https://drive.google.com/file/d/1S3_Cb5qOfqK8gkCDCR5s-1Fq71faDToL/view?usp=drive_link",
  "https://drive.google.com/file/d/1Kk_mqoxKKZAA_vcmb_T9oINdOHZkesO-/view?usp=drive_link"
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

    // Localizar dinámicamente la fila de cabecera y el índice de cada columna
    let headerRowIdx = -1;
    let colIdIdx = 0;
    let colNameIdx = 1;
    let colPaidIdx = 2;
    let colPhoneIdx = 8;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const cols = parseCSVLine(lines[i]).map(c => c.toUpperCase().trim());
      const idIdx = cols.findIndex(c => c === 'ID' || c === 'Nº' || c === 'SOCIO' || c === 'NUMERO');
      const nameIdx = cols.findIndex(c => c.includes('NOME') || c.includes('NOMBRE') || c.includes('APELIDOS') || c.includes('SOCIO'));
      const paidIdx = cols.findIndex(c => c.includes('PAG') || c.includes('CUOTA'));
      const phoneIdx = cols.findIndex(c => c.includes('TLF') || c.includes('TEL') || c.includes('MOVIL') || c.includes('MÓVIL'));

      if (idIdx !== -1 && (nameIdx !== -1 || paidIdx !== -1)) {
        headerRowIdx = i;
        colIdIdx = idIdx;
        if (nameIdx !== -1) colNameIdx = nameIdx;
        if (paidIdx !== -1) colPaidIdx = paidIdx;
        if (phoneIdx !== -1) colPhoneIdx = phoneIdx;
        break;
      }
    }

    const dataLines = headerRowIdx !== -1 ? lines.slice(headerRowIdx + 1) : lines.slice(1);

    const members: Member[] = [];

    for (let index = 0; index < dataLines.length; index++) {
      const line = dataLines[index];
      const row = parseCSVLine(line);
      const id = (row[colIdIdx] || '').trim();
      const name = (row[colNameIdx] || '').trim();
      
      // Descartar filas vacías o de sumatorios
      if (!id || !name || (isNaN(Number(id)) && !id.startsWith('S-'))) {
        if (!name || name.toUpperCase().includes('TOTAL') || name.toUpperCase().includes('LISTADO')) {
          continue;
        }
      }

      const rawPhone = row[colPhoneIdx] || (row[2] && row[2].match(/\d{9}/) ? row[2] : '') || '';
      const phone = rawPhone.replace(/\D/g, '');

      // Estado de pago
      const rawPaid = (row[colPaidIdx] || '').toUpperCase().trim();
      const isPaid = rawPaid === 'SI' || rawPaid === 'SÍ' || rawPaid === 'OK' || rawPaid === 'PAGADO';

      // Imagen predeterminada rotativa
      const imageUrl = DEFAULT_IMAGES[index % DEFAULT_IMAGES.length];

      members.push({
        id: id || `S-${index + 1}`,
        name: name || 'Socio Desconocido',
        phone,
        paid: isPaid ? 'SI' : 'NO',
        imageUrl,
        history: []
      });
    }

    return members.filter(m => m.name !== 'Socio Desconocido' && m.id !== '');
  } catch (error) {
    console.error("Failed to load members from Google Sheets", error);
    return [];
  }
};

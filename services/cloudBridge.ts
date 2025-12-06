import { Member, MatchHistoryRecord } from '../types';

// --------------------------------------------------------------------------
// ⚠️ CONFIGURACIÓN: PEGA AQUÍ LA URL DE TU "GOOGLE APPS SCRIPT WEB APP"
// --------------------------------------------------------------------------
export const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbzRNOYW5ZLy38Z4Ajeky4QkMsoHrN_U_Zq469Tua9uipPvD6M88Rz_CVaOBU1XMwPxTBg/exec";

// Estructura de datos global que queremos sincronizar
export interface AppState {
    assignments: Record<number, Member>;
    matchHistory: MatchHistoryRecord[];
    cycleHistory: string[];
    lastResetTime: number;
    // Estado del sorteo actual (para persistencia entre dispositivos)
    activeRaffle: {
        matchName: string;
        winners: Member[];
        winnersStatus: Record<string, string>; // 'pending' | 'confirmed' | 'rejected'
        reserveList: Member[];
        reserveWinners: Member[];
        timestamp: number;
        isCycleReset?: boolean; // Indicates if this specific raffle triggered a cycle reset
    } | null;
}

export const loadCloudData = async (): Promise<AppState | null> => {
    // Si no hay URL configurada, devolvemos null para usar LocalStorage
    if (!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR")) {
        console.warn("⚠️ URL de Google Apps Script no configurada. Usando modo Local.");
        return null;
    }

    try {
        const response = await fetch(CLOUD_API_URL);
        if (!response.ok) throw new Error("Error conectando con la nube");
        
        const text = await response.text();
        try {
            const data = JSON.parse(text);
             // Validación básica de que recibimos un objeto
            if (typeof data === 'object' && data !== null) {
                return data as AppState;
            }
        } catch (e) {
            console.warn("La respuesta de la nube no es un JSON válido (posiblemente vacía o error HTML):", text);
            // Si devuelve vacío o error, devolvemos null para forzar fallback o inicialización
            return null;
        }
        
        return null;
    } catch (error) {
        console.error("Error cargando datos de la nube:", error);
        return null;
    }
};

export const saveCloudData = async (state: AppState): Promise<boolean> => {
    // Guardado local de respaldo siempre
    localStorage.setItem('backup_local_state', JSON.stringify(state));

    if (!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR")) return false;

    try {
        // Usamos no-cors o text/plain para evitar preflight OPTIONS complejos en GAS, 
        // pero fetch POST standard suele funcionar bien con 'Cualquier usuario'
        await fetch(CLOUD_API_URL, {
            method: 'POST',
            body: JSON.stringify(state),
            // Google Apps Script maneja mejor text/plain para evitar CORS strict check
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
        });
        return true;
    } catch (error) {
        console.error("Error guardando en la nube:", error);
        return false;
    }
};
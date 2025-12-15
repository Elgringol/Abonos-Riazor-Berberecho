import { Member, MatchHistoryRecord } from '../types';

// --------------------------------------------------------------------------
// ⚠️ CONFIGURACIÓN: URL DEL SCRIPT DE GOOGLE APPS (BACKEND)
// --------------------------------------------------------------------------
export const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbzRNOYW5ZLy38Z4Ajeky4QkMsoHrN_U_Zq469Tua9uipPvD6M88Rz_CVaOBU1XMwPxTBg/exec";

// Estructura de datos global sincronizada
export interface AppState {
    assignments: Record<number, Member>;
    matchHistory: MatchHistoryRecord[];
    cycleHistory: string[];
    lastResetTime: number;
    // Estado del sorteo actual activo
    activeRaffle: {
        matchName: string;
        winners: Member[];
        winnersStatus: Record<string, string>; // 'pending' | 'confirmed' | 'rejected'
        reserveList: Member[];   // Lista de espera
        reserveWinners: Member[]; // Reservas que han pasado a ser ganadores
        timestamp: number;
        isCycleReset?: boolean;
    } | null;
}

export const loadCloudData = async (): Promise<AppState | null> => {
    if (!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR")) {
        console.warn("⚠️ URL de Google Apps Script no configurada. Usando modo Local.");
        return null;
    }

    try {
        // Cache-busting para evitar respuestas cacheadas por el navegador
        const response = await fetch(`${CLOUD_API_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error("Error conectando con la nube");
        
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            if (typeof data === 'object' && data !== null) {
                return data as AppState;
            }
        } catch (e) {
            console.warn("Respuesta inválida de la nube:", text);
            return null;
        }
        
        return null;
    } catch (error) {
        console.error("Error cargando datos de la nube:", error);
        return null;
    }
};

export const saveCloudData = async (state: AppState): Promise<boolean> => {
    // 1. Guardado local de respaldo inmediato
    try {
        localStorage.setItem('backup_local_state', JSON.stringify(state));
    } catch (e) {
        console.warn("Error guardando backup local", e);
    }

    if (!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR")) return false;

    try {
        await fetch(CLOUD_API_URL, {
            method: 'POST',
            body: JSON.stringify(state),
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
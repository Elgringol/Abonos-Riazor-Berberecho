import { Member, MatchHistoryRecord } from '../types';
import { fetchMembers } from './googleSheet';

// --------------------------------------------------------------------------
// ⚠️ CONFIGURACIÓN: URL DEL SCRIPT DE GOOGLE APPS (BACKEND)
// --------------------------------------------------------------------------
export const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbxMdBRugWNVef8KDa5x2AoabMLwOwYQAnapqSu1WJ0rigKMzOiCLmixSGK0-MBQhYA1hA/exec";

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

// --- HELPERS PARA COMPRESIÓN Y RECONSTRUCCIÓN ---

// Reconstruye un socio por ID a partir del censo
const reconstructMember = (id: string, allMembers: Member[]): Member => {
    const found = allMembers.find(m => m.id === id);
    if (found) return found;
    return { id, name: `Socio #${id}`, phone: '', paid: 'NO', history: [] };
};

// Reconstruye una lista de socios compatible con formatos antiguos
const reconstructMembersArray = (arr: any[], allMembers: Member[]): Member[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
        if (typeof item === 'object' && item !== null) {
            if ('name' in item && 'phone' in item) {
                return item as Member;
            }
            if (item.id) {
                return reconstructMember(String(item.id), allMembers);
            }
        }
        return reconstructMember(String(item), allMembers);
    });
};

const shrinkMember = (member: Member): { id: string } => {
    return { id: member.id };
};

const shrinkMembersArray = (arr: Member[]): { id: string }[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(m => m && m.id).map(shrinkMember);
};

const shrinkAssignments = (assignments: Record<number, Member>): Record<number, { id: string }> => {
    const shrunken: Record<number, { id: string }> = {};
    for (const [key, member] of Object.entries(assignments || {})) {
        if (member && member.id) {
            shrunken[Number(key)] = { id: member.id };
        }
    }
    return shrunken;
};

const reconstructAssignments = (shrunken: any, allMembers: Member[]): Record<number, Member> => {
    const reconstructed: Record<number, Member> = {};
    for (const [key, item] of Object.entries(shrunken || {})) {
        if (typeof item === 'object' && item !== null) {
            if ('name' in item && 'phone' in item) {
                reconstructed[Number(key)] = item as Member;
                continue;
            }
            const id = (item as any).id;
            if (id) {
                reconstructed[Number(key)] = reconstructMember(String(id), allMembers);
            }
        } else if (item) {
            reconstructed[Number(key)] = reconstructMember(String(item), allMembers);
        }
    }
    return reconstructed;
};

const shrinkMatchHistory = (history: MatchHistoryRecord[]): any[] => {
    if (!Array.isArray(history)) return [];
    return history.map(record => ({
        ...record,
        winners: shrinkMembersArray(record.winners),
        reserves: shrinkMembersArray(record.reserves)
    }));
};

const reconstructMatchHistory = (shrunkenHistory: any[], allMembers: Member[]): MatchHistoryRecord[] => {
    if (!Array.isArray(shrunkenHistory)) return [];
    return shrunkenHistory.map(record => ({
        ...record,
        winners: reconstructMembersArray(record.winners, allMembers),
        reserves: reconstructMembersArray(record.reserves, allMembers)
    }));
};

const shrinkActiveRaffle = (activeRaffle: AppState['activeRaffle']): any => {
    if (!activeRaffle) return null;
    return {
        ...activeRaffle,
        winners: shrinkMembersArray(activeRaffle.winners),
        reserveList: shrinkMembersArray(activeRaffle.reserveList),
        reserveWinners: shrinkMembersArray(activeRaffle.reserveWinners)
    };
};

const reconstructActiveRaffle = (shrunken: any, allMembers: Member[]): AppState['activeRaffle'] => {
    if (!shrunken) return null;
    return {
        ...shrunken,
        winners: reconstructMembersArray(shrunken.winners, allMembers),
        reserveList: reconstructMembersArray(shrunken.reserveList, allMembers),
        reserveWinners: reconstructMembersArray(shrunken.reserveWinners, allMembers)
    };
};

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
                const allMembers = await fetchMembers();
                
                // Reconstruimos el estado completo materializando los datos desde el censo
                return {
                    assignments: reconstructAssignments(data.assignments, allMembers),
                    matchHistory: reconstructMatchHistory(data.matchHistory, allMembers),
                    cycleHistory: data.cycleHistory || [],
                    lastResetTime: data.lastResetTime || Date.now(),
                    // Si activeRaffle es undefined (no existe en el JSON), lo dejamos así para que el frontend
                    // sepa diferenciarlo de un activeRaffle: null explícito (jornada cerrada)
                    activeRaffle: data.activeRaffle === undefined ? undefined : reconstructActiveRaffle(data.activeRaffle, allMembers)
                } as any as AppState; // Forzamos cast para soportar el activeRaffle: undefined
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
    // 1. Guardado local de respaldo inmediato (guardar completo sin comprimir para que local sea óptimo)
    try {
        localStorage.setItem('backup_local_state', JSON.stringify(state));
    } catch (e) {
        console.warn("Error guardando backup local", e);
    }

    if (!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR")) return false;

    // Comprimimos el estado reduciendo el censo redundante
    const shrunkenState = {
        assignments: shrinkAssignments(state.assignments),
        matchHistory: shrinkMatchHistory(state.matchHistory),
        cycleHistory: state.cycleHistory || [],
        lastResetTime: state.lastResetTime,
        activeRaffle: shrinkActiveRaffle(state.activeRaffle)
    };

    try {
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            body: JSON.stringify(shrunkenState),
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
        });
        if (!response.ok) {
            console.error("Error al guardar estado comprimido en la nube:", response.statusText);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error guardando en la nube:", error);
        return false;
    }
};
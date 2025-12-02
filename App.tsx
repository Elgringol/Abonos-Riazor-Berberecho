import React, { useState, useEffect, useMemo } from 'react';
import { toPng, toBlob } from 'html-to-image';
import { fetchMembers, DEFAULT_IMAGES } from './services/googleSheet';
import { Member } from './types';
import { generateWhatsAppLink } from './utils';
import CardCanvas from './components/CardCanvas';
import { Search, Share2, CheckCircle, RefreshCw, XCircle, Copy, Eye, Image as ImageIcon, Send, Download, Globe, Pencil, UserPlus, Users, RotateCcw, AlertTriangle, Trophy, Ticket, ClipboardList, Shuffle, ArrowRightCircle, Calendar, Check, X, MessageCircle, History, Archive, Save, User, Database } from 'lucide-react';

// --- Constantes Visuales ---
const LOGO_ID = "10m8lfNupdyr8st5zXKE5xobx-NsciILT";
// CORRECCIÓN: Usamos Thumbnail API directa para el logo principal para máxima velocidad
const LOGO_URL = `https://drive.google.com/thumbnail?id=${LOGO_ID}&sz=w800`;

// IMAGEN DE FONDO PARA EL SORTEO
// Se usa la imagen proporcionada (Diseño NOIA) con un tamaño optimizado
const RAFFLE_BG_URL = "https://drive.google.com/thumbnail?id=16VQH_e1nCpqc52vRHPRKYzrCTLDSTXpc&sz=w1080"; 

// --- Configuración de los 10 Abonos Fijos ---
// Definición explícita de cada slot con sus datos de asiento y su imagen correspondiente.
const PASS_SLOTS = [
    { slotId: 1, seatInfo: "F:10 A:89", imageUrl: DEFAULT_IMAGES[0] },
    { slotId: 2, seatInfo: "F:9 A:79", imageUrl: DEFAULT_IMAGES[1] },
    { slotId: 3, seatInfo: "F:9 A:91", imageUrl: DEFAULT_IMAGES[2] },
    { slotId: 4, seatInfo: "F:9 A:93", imageUrl: DEFAULT_IMAGES[3] },
    { slotId: 5, seatInfo: "F:8 A:79", imageUrl: DEFAULT_IMAGES[4] },
    { slotId: 6, seatInfo: "F:8 A:81", imageUrl: DEFAULT_IMAGES[5] },
    { slotId: 7, seatInfo: "F:8 A:83", imageUrl: DEFAULT_IMAGES[6] },
    { slotId: 8, seatInfo: "F:8 A:89", imageUrl: DEFAULT_IMAGES[7] },
    { slotId: 9, seatInfo: "F:6 A:123", imageUrl: DEFAULT_IMAGES[8] },
    { slotId: 10, seatInfo: "F:6 A:125", imageUrl: DEFAULT_IMAGES[9] },
];


// --- Helpers de Negocio ---

// 1. Extraer nombre (Lógica ajustada para formato: APELLIDO 1 + APELLIDO 2 + NOMBRE)
const getFirstName = (fullName: string) => {
  if (!fullName) return 'Socio';
  
  const cleanName = fullName.trim();
  
  // Opción A: Si viene con coma (Formato: Apellidos, Nombre)
  if (cleanName.includes(',')) {
      const namePart = cleanName.split(',')[1].trim();
      return namePart.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }

  const words = cleanName.split(/\s+/);

  // Opción B: Si tiene 3 o más palabras (Ej: GARCIA PEREZ JUAN o GARCIA PEREZ JUAN ANTONIO)
  // La estructura dada es AP1 + AP2 + NOMBRE. Por tanto, saltamos las 2 primeras palabras.
  if (words.length >= 3) {
      const nameParts = words.slice(2); 
      return nameParts.join(' ').toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  
  // Opción C: Si tiene 2 palabras (Ej: PEREZ JUAN) - Asumimos Apellido + Nombre por seguridad
  if (words.length === 2) {
      return words[1].toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }

  // Fallback: Si solo hay 1 palabra
  return words[0].toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
};

// 2. Generar Link del Abono (AHORA INCLUYE TIMESTAMP Y SLOT ID)
const generateLinkForMember = (member: Member, referenceTimestamp?: number, slotId?: number): string => {
    // Detectamos la URL base actual (sea localhost o web publicada)
    const baseUrl = window.location.href.split('#')[0].split('?')[0];
    
    // Construimos los parámetros
    const params = new URLSearchParams();
    params.set('id', member.id);
    if (referenceTimestamp) params.set('t', referenceTimestamp.toString());
    if (slotId) params.set('slot', slotId.toString()); // IMPORTANTE: Pasamos el Slot ID

    // Usamos HashRouter style (#/view)
    return `${baseUrl}#/view?${params.toString()}`;
};

// 3. Generar Mensaje de WhatsApp (MEJORADO Y VISUAL)
const getWhatsAppMessage = (member: Member, link: string) => {
    const firstName = getFirstName(member.name);
    
    // Mensaje con emojis compatibles y estructura clara
    const message = `👋 Hola *${firstName.toUpperCase()}*,

🔵⚪ *TU ABONO DIGITAL - DÉPOR*

Aquí tienes tu enlace de acceso único para entrar en Riazor:
👇👇👇
${link}

🚨 *INSTRUCCIONES IMPORTANTES:*
1️⃣ 🔆 Sube el *BRILLO* de tu móvil al máximo.
2️⃣ 📲 Muestra el *CÓDIGO DE BARRAS* en el torno.
3️⃣ ❌ *NO* uses captura de pantalla (el pase caduca).

¡Nos vemos en Riazor! ¡Forza Dépor!`;

    return generateWhatsAppLink(member.phone, message);
};

// 4. Función de Descarga de Imagen
const downloadCardImage = async (elementId: string, fileName: string) => {
    const node = document.getElementById(elementId);
    if (!node) return;

    try {
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err) {
        console.error('Error al generar la imagen', err);
        alert('No se pudo generar la imagen. Inténtalo de nuevo.');
    }
};

// --- Tipos para el Sorteo ---
type WinnerStatus = 'pending' | 'confirmed' | 'rejected';

// --- Tipo para Historial ---
interface MatchHistoryRecord {
    id: string;
    date: number; // Fecha de cierre
    matchName: string;
    winners: Member[];
    reserves: Member[];
}


// --- Sub-Component: Dashboard (Admin View) ---
const Dashboard: React.FC = () => {
  // Tabs: 'tickets' (Gestión Abonos) | 'raffle' (Sorteos) | 'history' (Historial)
  const [currentTab, setCurrentTab] = useState<'tickets' | 'raffle' | 'history'>('tickets');
    
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estado para la asignación de socios a slots
  // Diccionario: { [slotId]: Member }
  const [assignments, setAssignments] = useState<Record<number, Member>>({});
  
  // Timestamp del último Reset (Para sincronizar caducidad)
  const [lastResetTime, setLastResetTime] = useState<number>(() => {
      const saved = localStorage.getItem('last_reset_time');
      return saved ? parseInt(saved) : Date.now();
  });

  // Estado para Modal de Asignación (Buscador)
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [currentSlotId, setCurrentSlotId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para Vista Previa Completa y Quick Share
  const [selectedPreviewData, setSelectedPreviewData] = useState<{member: Member, imageUrl: string, slotId: number} | null>(null);
  const [quickShareData, setQuickShareData] = useState<{member: Member, imageUrl: string, slotId: number} | null>(null);
  const [copied, setCopied] = useState(false);

  // --- ESTADOS DEL SORTEO ---
  const [matchName, setMatchName] = useState('');
  const [raffleWinners, setRaffleWinners] = useState<Member[]>([]);
  const [winnersStatus, setWinnersStatus] = useState<Record<string, WinnerStatus>>({});
  const [reserveList, setReserveList] = useState<Member[]>([]);
  const [reserveWinners, setReserveWinners] = useState<Member[]>([]);
  // CAMBIO CLAVE: _v2 para resetear el historial local según solicitud
  const [cycleHistory, setCycleHistory] = useState<string[]>(() => {
      const saved = localStorage.getItem('raffle_cycle_history_v2');
      return saved ? JSON.parse(saved) : [];
  });
  const [reserveSpotsNeeded, setReserveSpotsNeeded] = useState(1);
  const [showReserveSearch, setShowReserveSearch] = useState(false);

  // --- ESTADO HISTORIAL ---
  // CAMBIO CLAVE: _v2 para resetear el historial local según solicitud
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>(() => {
      const saved = localStorage.getItem('raffle_match_history_v2');
      try {
          const parsed = saved ? JSON.parse(saved) : [];
          return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
          console.error("Error cargando historial", e);
          return [];
      }
  });

  // --- ESTADOS BUSCADOR HISTORIAL ---
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [selectedHistoryMember, setSelectedHistoryMember] = useState<Member | null>(null);

  useEffect(() => {
    loadData();
    
    // Cargar asignaciones guardadas
    const saved = localStorage.getItem('slot_assignments');
    if (saved) {
        try {
            setAssignments(JSON.parse(saved));
        } catch (e) {}
    }
  }, []);

  // CÁLCULO AUTOMÁTICO DE HUECOS LIBRES
  // Se calcula restando a 10 el número de socios confirmados.
  // Los pendientes o rechazados se consideran huecos libres para reservas.
  useEffect(() => {
    if (raffleWinners.length > 0) {
        const confirmedCount = Object.values(winnersStatus).filter(s => s === 'confirmed').length;
        // Mínimo 0, máximo 10. Si hay 3 confirmados, necesitamos 7 reservas.
        // Si hay 0 confirmados (todos pendientes), necesitamos 10 reservas.
        const needed = Math.max(0, 10 - confirmedCount);
        setReserveSpotsNeeded(needed);
    }
  }, [winnersStatus, raffleWinners]);

  // CÁLCULO DE ESTADÍSTICAS PARA DASHBOARD SORTEO
  const raffleStats = useMemo(() => {
      const activeMembers = allMembers.filter(m => m.paid === 'SI');
      
      // Socios activos que NO han ganado en el ciclo actual.
      // AÑADIDO: También comprobamos el historial importado del Excel (m.history)
      // que ahora incluye las columnas "Partido" y "Ganador"
      const pendingToWin = activeMembers.filter(m => {
          const inLocalCycle = cycleHistory.includes(m.id);
          const hasSheetHistory = m.history && m.history.length > 0;
          return !inLocalCycle && !hasSheetHistory;
      });
      
      return {
          total: allMembers.length,
          active: activeMembers.length,
          pending: pendingToWin.length
      };
  }, [allMembers, cycleHistory]);


  const loadData = async () => {
    setLoading(true);
    const data = await fetchMembers();
    setAllMembers(data);
    setLoading(false);
  };

  // --- LÓGICA DE SORTEOS ---
  
  const runMainRaffle = () => {
      if (!matchName.trim()) {
          alert("Por favor, introduce el nombre del partido.");
          return;
      }
      
      const eligibleMembers = allMembers.filter(m => m.paid.toUpperCase() === 'SI' || m.paid.toUpperCase() === 'SÍ');
      
      if (eligibleMembers.length === 0) {
          alert("No hay socios con cuota pagada para sortear.");
          return;
      }

      // Reiniciamos estados de confirmación
      setWinnersStatus({});
      setReserveWinners([]);

      // 1. Filtrar los que NO han ganado en este ciclo (Local o Excel)
      let availableInCycle = eligibleMembers.filter(m => {
          const inLocalCycle = cycleHistory.includes(m.id);
          // AÑADIDO: Verificación de historial en Excel
          const hasSheetHistory = m.history && m.history.length > 0;
          return !inLocalCycle && !hasSheetHistory;
      });
      
      let winners: Member[] = [];
      let newCycleHistory = [...cycleHistory];
      let cycleResetOccurred = false;

      // 2. Si hay menos de 10 candidatos en el ciclo actual...
      if (availableInCycle.length < 10) {
          // A. Los que quedan ganan automáticamente
          winners = [...availableInCycle];
          
          // B. Reseteamos el ciclo (todos vuelven a estar disponibles salvo los que acaban de ganar)
          const winnersIds = new Set(winners.map(w => w.id));
          
          // El nuevo "bombo" son todos los elegibles MENOS los que ya ganaron en la fase A
          // NOTA: Al hacer reset, "perdonamos" el historial del Excel para que puedan volver a ganar en el nuevo ciclo
          const refreshedPot = eligibleMembers.filter(m => !winnersIds.has(m.id));
          
          // C. Sorteamos los huecos que faltan
          const spotsNeeded = 10 - winners.length;
          const shuffledPot = [...refreshedPot].sort(() => 0.5 - Math.random());
          const extraWinners = shuffledPot.slice(0, spotsNeeded);
          
          winners = [...winners, ...extraWinners];
          
          // D. Iniciamos nuevo historial local solo con los ganadores de esta ronda
          newCycleHistory = winners.map(w => w.id);
          cycleResetOccurred = true;

      } else {
          // Sorteo normal: Hay suficientes candidatos
          const shuffled = [...availableInCycle].sort(() => 0.5 - Math.random());
          winners = shuffled.slice(0, 10);
          
          // Añadimos ganadores al historial local
          winners.forEach(w => newCycleHistory.push(w.id));
      }

      setRaffleWinners(winners);
      setCycleHistory(newCycleHistory);
      // CAMBIO: Key _v2
      localStorage.setItem('raffle_cycle_history_v2', JSON.stringify(newCycleHistory));
      
      if (cycleResetOccurred) {
          alert("ℹ️ CICLO COMPLETADO: Se han reiniciado las exclusiones. Todos los socios (incluidos los del Excel) vuelven a entrar en el sorteo.");
      }
  };

  const updateWinnerStatus = (memberId: string, status: WinnerStatus) => {
      setWinnersStatus(prev => ({
          ...prev,
          // Si pulsan el mismo botón, se deselecciona (vuelve a pending)
          [memberId]: prev[memberId] === status ? 'pending' : status
      }));
  };

  const transferWinnersToSlots = () => {
      // 1. Recopilar Socios Confirmados del Sorteo Principal
      const confirmedMainWinners = raffleWinners.filter(w => winnersStatus[w.id] === 'confirmed');
      
      // 2. Recopilar Reservas Premiados
      const validReserves = reserveWinners;

      // 3. Crear lista definitiva combinada
      const finalList = [...confirmedMainWinners, ...validReserves];

      if (finalList.length === 0) {
          alert("⚠️ No hay socios confirmados ni reservas premiados para asignar.");
          return;
      }
      
      // 4. Reiniciar el Contador de Caducidad (4 días desde AHORA)
      // Igual que hacemos en el Reset completo, porque es un nuevo partido.
      const now = Date.now();
      setLastResetTime(now);
      localStorage.setItem('last_reset_time', now.toString());

      // 5. Asignar a los Slots 1-10
      const newAssignments: Record<number, Member> = {};
      finalList.slice(0, 10).forEach((member, index) => {
          newAssignments[index + 1] = member;
      });
      
      // 6. Guardar y Redirigir
      setAssignments(newAssignments);
      localStorage.setItem('slot_assignments', JSON.stringify(newAssignments));
      setCurrentTab('tickets'); // Volver a la pestaña principal
      
      alert(`✅ ASIGNACIÓN COMPLETADA\n\n- Socios asignados: ${finalList.length}\n- Temporizador de caducidad: REINICIADO (96h)`);
  };
  
  // --- FUNCIÓN CERRAR JORNADA Y GUARDAR HISTORIAL ---
  const handleCloseMatchday = () => {
      if (!matchName.trim() || raffleWinners.length === 0) {
          alert("No hay un sorteo activo para cerrar.");
          return;
      }

      const confirmMsg = `¿Estás seguro de cerrar la jornada "${matchName}"?\n\nSe guardará el registro en el Historial con los premiados y reservas actuales.`;
      if (!window.confirm(confirmMsg)) return;

      const newRecord: MatchHistoryRecord = {
          id: Date.now().toString(),
          date: Date.now(),
          matchName: matchName,
          // Guardamos copia de los ganadores y reservas para evitar referencias
          winners: [...raffleWinners], 
          reserves: [...reserveList]
      };

      // Protección contra historial corrupto
      const safeHistory = Array.isArray(matchHistory) ? matchHistory : [];
      const updatedHistory = [newRecord, ...safeHistory];
      
      setMatchHistory(updatedHistory);
      // CAMBIO: Key _v2
      localStorage.setItem('raffle_match_history_v2', JSON.stringify(updatedHistory));

      // Limpieza del sorteo actual
      setMatchName('');
      setRaffleWinners([]);
      setReserveList([]);
      setReserveWinners([]);
      setWinnersStatus({});

      alert("✅ Jornada cerrada y guardada en el Historial.");
      setCurrentTab('history');
  };

  // --- FUNCIÓN PARA COPIAR LA TARJETA DEL SORTEO ---
  const handleCopyRaffleImage = async () => {
      const node = document.getElementById('raffle-card');
      if (!node) return;
      try {
          // Generamos el Blob de la imagen
          // Aumentamos pixelRatio para calidad, usamos cacheBust por si acaso
          const blob = await toBlob(node, { cacheBust: true, pixelRatio: 2 });
          
          if (!blob) throw new Error("Blob generado es nulo.");

          // Intento de escritura en portapapeles
          try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              alert("📋 ¡Imagen copiada correctamente!");
          } catch (clipError) {
              console.error("Error escritura portapapeles", clipError);
              // Fallback: Descargar si falla el portapapeles (Safari, Firefox a veces)
              const link = document.createElement('a');
              link.download = `Sorteo_${matchName || 'Abonos'}.png`;
              link.href = URL.createObjectURL(blob);
              link.click();
              alert("⚠️ No se pudo copiar al portapapeles. Se ha descargado la imagen en su lugar.");
          }

      } catch (e: any) {
          console.error("Error al generar imagen del sorteo", e);
          alert(`Error al generar la imagen: ${e.message || 'Error desconocido'}`);
      }
  };


  const handleAddReserve = (member: Member) => {
      if (!reserveList.find(m => m.id === member.id)) {
          setReserveList([...reserveList, member]);
          setShowReserveSearch(false);
          setSearchTerm('');
      }
  };

  const removeReserve = (id: string) => {
      setReserveList(reserveList.filter(m => m.id !== id));
  };

  const runReserveRaffle = () => {
      if (reserveList.length === 0) return;
      if (reserveSpotsNeeded <= 0) return;
      
      const shuffled = [...reserveList].sort(() => 0.5 - Math.random());
      const winners = shuffled.slice(0, reserveSpotsNeeded);
      setReserveWinners(winners);
  };

  // --- FUNCIÓN DE RESET COMPLETO ---
  const handleFullReset = async () => {
      const confirmMsg = "⚠️ ¿RESET COMPLETO?\n\nEsta acción:\n1. Borrará todos los socios asignados de los 10 abonos.\n2. Actualizará los datos desde el Excel.\n3. Reiniciará el plazo de 4 días de caducidad.\n\n¿Deseas continuar?";
      
      if (!window.confirm(confirmMsg)) return;

      setLoading(true);
      
      // 1. Limpiar Asignaciones PRIMERO (Visualmente instantáneo)
      setAssignments({});
      localStorage.removeItem('slot_assignments');

      try {
          // 2. Recargar datos (fetchMembers tiene cache busting ahora)
          const data = await fetchMembers();
          setAllMembers(data);
          
          // 3. Reiniciar Tiempo
          const now = Date.now();
          setLastResetTime(now);
          localStorage.setItem('last_reset_time', now.toString());
          
      } catch (e) {
          console.error("Error en reset", e);
          alert('Hubo un error al actualizar los datos. Sin embargo, los abonos se han vaciado.');
      } finally {
          setLoading(false);
      }
  };

  // --- Handlers de Asignación ---
  const openAssignmentModal = (slotId: number) => {
      setCurrentSlotId(slotId);
      setSearchTerm('');
      setAssignmentModalOpen(true);
  };

  const handleAssignMember = (member: Member) => {
      if (currentSlotId !== null) {
          const newAssignments = { ...assignments, [currentSlotId]: member };
          setAssignments(newAssignments);
          localStorage.setItem('slot_assignments', JSON.stringify(newAssignments));
          setAssignmentModalOpen(false);
          setCurrentSlotId(null);
      }
  };

  const handleUnassignMember = () => {
       if (currentSlotId !== null) {
          const newAssignments = { ...assignments };
          delete newAssignments[currentSlotId];
          setAssignments(newAssignments);
          localStorage.setItem('slot_assignments', JSON.stringify(newAssignments));
          setAssignmentModalOpen(false);
          setCurrentSlotId(null);
      }
  };

  // Filtrado para el modal
  const filteredMembersForAssignment = allMembers.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Filtrado para buscador historial
  const filteredMembersForHistory = allMembers.filter(m => 
    historySearchTerm && (
        m.name.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
        m.id.toLowerCase().includes(historySearchTerm.toLowerCase())
    )
  ).slice(0, 5); // Limitamos a 5 resultados para no saturar

  const getMemberHistory = (memberId: string) => {
      // Historial Local (App)
      const wins = matchHistory.filter(r => r.winners.some(w => w.id === memberId));
      const reserves = matchHistory.filter(r => r.reserves.some(res => res.id === memberId));
      
      // Historial Importado (Excel)
      // Buscamos el socio en allMembers para leer su campo 'history' actualizado
      const member = allMembers.find(m => m.id === memberId);
      const importedWins = member?.history || [];

      return { wins, reserves, importedWins };
  };


  // --- Handlers de Acciones (Ver/Compartir) ---
  const handlePreview = (slotId: number, imageUrl: string) => {
    const member = assignments[slotId];
    if (member) {
        // Pasamos slotId para asegurar correspondencia
        setSelectedPreviewData({ member, imageUrl, slotId });
    }
  };

  const handleQuickShare = (slotId: number, imageUrl: string) => {
    const member = assignments[slotId];
    if (member) {
        setCopied(false);
        // Pasamos slotId para generar el enlace correcto
        setQuickShareData({ member, imageUrl, slotId });
    }
  };

  const closePreview = () => setSelectedPreviewData(null);
  const closeQuickShare = () => setQuickShareData(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24 font-sans">
      {/* HEADER */}
      <header className="-mx-4 -mt-4 mb-6 text-center pt-10 pb-6 bg-white rounded-b-[2.5rem] shadow-sm border-b border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-depor-blue/5 rounded-b-[50%] -z-10"></div>
        <div className="flex justify-center mb-5 relative">
            <div className="relative z-10 p-2 bg-white rounded-full shadow-sm">
                <img 
                    src={LOGO_URL} 
                    alt="Logo" 
                    className="h-28 w-auto object-contain hover:scale-105 transition-transform duration-300 drop-shadow-sm"
                />
            </div>
        </div>
        <h1 className="text-3xl font-black text-depor-blue tracking-tighter uppercase leading-none">
            Peña Deportivista
            <span className="block text-4xl text-orange-brand mt-1 drop-shadow-sm">Berberecho</span>
        </h1>
        <div className="mt-4 flex items-center justify-center gap-2 opacity-80">
            <div className="h-[1px] w-8 bg-gray-300"></div>
            <p className="text-gray-400 font-bold text-[10px] tracking-[0.25em] uppercase">GESTOR DE ABONOS RIAZOR</p>
            <div className="h-[1px] w-8 bg-gray-300"></div>
        </div>
      </header>

      {/* TABS DE NAVEGACIÓN */}
      <div className="flex justify-center mb-6">
          <div className="bg-white p-1 rounded-full shadow-sm border border-gray-200 inline-flex">
              <button 
                onClick={() => setCurrentTab('tickets')}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'tickets' ? 'bg-depor-blue text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                  <Ticket className="w-4 h-4" /> Gestión Abonos
              </button>
              <button 
                onClick={() => setCurrentTab('raffle')}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'raffle' ? 'bg-orange-brand text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                  <Trophy className="w-4 h-4" /> Sorteos
              </button>
              <button 
                onClick={() => setCurrentTab('history')}
                className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'history' ? 'bg-depor-blue text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                  <History className="w-4 h-4" /> Historial
              </button>
          </div>
      </div>

      {currentTab === 'tickets' ? (
        // --- PESTAÑA: GESTIÓN DE PASES (VISTA ORIGINAL) ---
        <>
            {/* BOTÓN DE RESET Y ACTUALIZACIÓN */}
            <div className="max-w-md mx-auto mb-6 px-1">
                <button 
                    type="button" 
                    onClick={handleFullReset}
                    disabled={loading}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm active:scale-[0.98]"
                >
                    <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Reseteando...' : 'REINICIAR'}
                </button>
            </div>

            {/* LISTA DE 10 ABONOS FIJOS */}
            <div className="max-w-md mx-auto space-y-4">
                {loading ? (
                    <div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2">
                        <RefreshCw className="animate-spin w-4 h-4"/> Procesando...
                    </div>
                ) : (
                    PASS_SLOTS.map((slot) => {
                        const assignedMember = assignments[slot.slotId];
                        
                        return (
                            <div key={slot.slotId} className="group bg-white p-3 rounded-2xl shadow-sm border border-gray-100 hover:border-depor-blue/30 hover:shadow-md transition-all flex items-center justify-between gap-3 relative overflow-hidden">
                                
                                <div className="flex flex-col items-center justify-center bg-gray-50 w-14 h-full py-2 rounded-xl border border-gray-100 shrink-0">
                                    <span className="text-2xl font-black text-depor-blue/80 leading-none">{slot.slotId}</span>
                                    <span className="text-[9px] font-bold text-gray-400 mt-1 uppercase text-center leading-tight">
                                        {slot.seatInfo}
                                    </span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    {assignedMember ? (
                                        <>
                                            <p className="font-bold text-gray-800 text-base truncate">{assignedMember.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">ID: {assignedMember.id}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${assignedMember.paid.toLowerCase() === 'si' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {assignedMember.paid.toLowerCase() === 'si' && <div className="w-1 h-1 rounded-full bg-green-600 animate-pulse" />}
                                                    {assignedMember.paid.toLowerCase() === 'si' ? 'ACTIVO' : 'PENDIENTE'}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2 opacity-40">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                                <Users className="w-4 h-4 text-gray-400" />
                                            </div>
                                            <span className="text-sm font-medium italic text-gray-400">Sin asignar</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => openAssignmentModal(slot.slotId)}
                                        className={`w-9 h-9 rounded-full border transition-all flex items-center justify-center shadow-sm ${assignedMember ? 'bg-white border-gray-200 text-gray-400 hover:text-orange-500 hover:border-orange-200' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'}`}
                                        title={assignedMember ? "Cambiar Socio" : "Asignar Socio"}
                                    >
                                        {assignedMember ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                                    </button>

                                    {assignedMember && (
                                        <>
                                            <div className="w-[1px] h-6 bg-gray-200 mx-1"></div>
                                            <button
                                                onClick={() => handlePreview(slot.slotId, slot.imageUrl)}
                                                className="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-depor-blue hover:border-depor-blue/30 hover:bg-blue-50 transition-all flex items-center justify-center shadow-sm"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleQuickShare(slot.slotId, slot.imageUrl)}
                                                className="w-9 h-9 rounded-full bg-depor-blue text-white shadow-lg shadow-depor-blue/20 hover:bg-blue-700 hover:scale-105 transition-all flex items-center justify-center"
                                            >
                                                <Share2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </>
      ) : currentTab === 'raffle' ? (
        // --- PESTAÑA: SORTEOS Y RESERVAS (NUEVO MÓDULO) ---
        <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
            
            {/* 1. CONFIGURACIÓN DEL PARTIDO */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                    <Calendar className="w-5 h-5 text-orange-brand" /> Partido
                </h2>
                <div className="space-y-4">
                    <input 
                        type="text" 
                        placeholder="Ej: Dépor vs Celta" 
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-brand/20 transition-all font-medium"
                        value={matchName}
                        onChange={(e) => setMatchName(e.target.value)}
                    />
                    
                    {/* DASHBOARD ESTADÍSTICAS */}
                    <div className="grid grid-cols-3 gap-3">
                         <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col items-center justify-center shadow-sm">
                             <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Total</span>
                             <span className="text-xl font-black text-gray-600 leading-none">{raffleStats.total}</span>
                        </div>
                        <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex flex-col items-center justify-center shadow-sm">
                             <span className="text-[10px] text-green-600/70 font-bold uppercase tracking-wider mb-0.5">Activos</span>
                             <span className="text-xl font-black text-green-600 leading-none">{raffleStats.active}</span>
                        </div>
                         <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex flex-col items-center justify-center shadow-sm" title="Socios pagados que aún no han ganado (ni en App ni en Excel)">
                             <span className="text-[10px] text-orange-600/70 font-bold uppercase tracking-wider mb-0.5">Pendientes</span>
                             <span className="text-xl font-black text-orange-600 leading-none">{raffleStats.pending}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. SORTEO PRINCIPAL */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-orange-brand" /> Sorteo Abonos
                </h2>
                
                {raffleWinners.length === 0 ? (
                    <button 
                        onClick={runMainRaffle}
                        disabled={loading}
                        className="w-full bg-orange-brand text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-brand/30 hover:bg-orange-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Shuffle className="w-5 h-5" /> REALIZAR SORTEO (10)
                    </button>
                ) : (
                    <div className="space-y-4">
                        {/* --- ESTRUCTURA DE 2 COLUMNAS SEPARADAS --- */}
                        <div className="flex items-start gap-2">
                            
                            {/* COLUMNA IZQUIERDA: TARJETA VISUAL CON IMAGEN */}
                            <div 
                                id="raffle-card"
                                onClick={handleCopyRaffleImage}
                                className="flex-1 relative rounded-2xl overflow-hidden shadow-lg border border-gray-200 cursor-pointer hover:shadow-xl transition-shadow group"
                                title="Click para copiar imagen del sorteo"
                            >
                                {/* FONDO DE IMAGEN */}
                                <div className="absolute inset-0 z-0">
                                    {RAFFLE_BG_URL ? (
                                        <img 
                                            // PROXIFICAR PARA EVITAR ERROR CORS EN LA CAPTURA
                                            src={`https://wsrv.nl/?url=${encodeURIComponent(RAFFLE_BG_URL)}&output=png`} 
                                            crossOrigin="anonymous"
                                            alt="Fondo Estadio" 
                                            className="w-full h-full object-cover object-top opacity-100" 
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-depor-blue to-blue-900 opacity-90"></div>
                                    )}
                                    <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[1px]"></div>
                                    {/* Icono de copiar al hacer hover (visual cue) */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none z-20">
                                        <span className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-md flex items-center gap-1">
                                            <Copy className="w-3 h-3"/> Copiar Imagen
                                        </span>
                                    </div>
                                </div>

                                {/* CONTENIDO (Nombres) */}
                                <div className="relative z-10 flex flex-col p-2 gap-1.5">
                                    {/* Header */}
                                    <div className="bg-white/40 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm border border-white/30 flex items-center justify-center mb-1 h-10">
                                        <h3 className="text-[10px] sm:text-xs font-black text-depor-blue uppercase tracking-wider text-center">
                                            🏆 PREMIADOS - {matchName}
                                        </h3>
                                    </div>

                                    {/* Lista de Nombres */}
                                    {raffleWinners.map((w, i) => {
                                        const status = winnersStatus[w.id] || 'pending';
                                        return (
                                            <div key={w.id} className="bg-white/20 backdrop-blur-md px-3 py-0 rounded-xl shadow-sm border border-white/20 flex items-center justify-between min-w-0 h-12 transition-colors hover:bg-white/40">
                                                <div className="flex items-center gap-2 min-w-0 mr-1 overflow-hidden">
                                                    <span className="font-mono font-bold text-gray-800 text-xs w-4 shrink-0">{i+1}.</span>
                                                    <span className={`font-bold text-xs truncate text-gray-900 ${status === 'rejected' ? 'text-gray-500 line-through decoration-2 opacity-60' : ''}`}>
                                                        {w.name}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] bg-depor-blue text-white px-1.5 py-0.5 rounded font-bold font-mono min-w-[28px] text-center shadow-sm shrink-0">
                                                    {w.id}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* COLUMNA DERECHA: BOTONES DE ACCIÓN */}
                            <div className="flex flex-col gap-1.5 pt-2">
                                {/* Spacer para alinear con el header de la izquierda */}
                                <div className="h-10 mb-1"></div>

                                {raffleWinners.map((w) => {
                                    const status = winnersStatus[w.id] || 'pending';
                                    const waMessage = `👋 ¡Hola *${getFirstName(w.name).toUpperCase()}*! 💙🤍

🎉 ¡ENHORABUENA! Has sido agraciado en el sorteo de la Peña con un abono para el partido:

⚽ *DEPOR - ${matchName.toUpperCase()}*

⚠️ *IMPORTANTE:*
Para disfrutar del abono, *debes confirmar tu asistencia respondiendo a este mensaje* antes de las ⏳ *15:00h del Jueves* previo al partido.

🚨 Si no confirmas a tiempo, el abono pasará automáticamente a un socio reserva.

📲 Sigue todos los sorteos y noticias en nuestro Canal Oficial:
https://whatsapp.com/channel/0029Vat7ZB0Id7nS4Ri1L825

¡Nos vemos en Riazor! ¡Forza Dépor!`;
                                    
                                    const waLink = generateWhatsAppLink(w.phone, waMessage);

                                    return (
                                        <div key={w.id} className="flex items-center bg-white border border-gray-100 rounded-xl p-1 shadow-sm h-12">
                                            <button 
                                                onClick={() => updateWinnerStatus(w.id, 'confirmed')}
                                                className={`w-8 h-full rounded-lg flex items-center justify-center transition-all ${status === 'confirmed' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-300 hover:text-green-500 hover:bg-green-50'}`}
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => updateWinnerStatus(w.id, 'rejected')}
                                                className={`w-8 h-full rounded-lg flex items-center justify-center transition-all ${status === 'rejected' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>
                                            <a 
                                                href={waLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="w-8 h-full rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 transition-all"
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { if(window.confirm("¿Repetir sorteo? Se perderán los resultados actuales.")) setRaffleWinners([]) }}
                                className="flex-1 py-3 text-gray-500 font-bold text-xs hover:bg-gray-50 rounded-xl border border-gray-200"
                            >
                                <RotateCcw className="w-3 h-3 inline mr-1" /> Repetir
                            </button>
                            <button 
                                onClick={transferWinnersToSlots}
                                className="flex-[2] py-3 bg-depor-blue text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"
                            >
                                <ArrowRightCircle className="w-4 h-4" /> Asignar a Abonos
                            </button>
                            {/* BOTÓN CERRAR JORNADA */}
                             <button 
                                type="button"
                                onClick={handleCloseMatchday}
                                className="w-12 py-3 bg-gray-800 text-white rounded-xl hover:bg-black shadow-md flex items-center justify-center"
                                title="Cerrar Jornada y Guardar en Historial"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 3. RESERVAS */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-gray-500" /> Reservas
                    </h2>
                    <button 
                        onClick={() => { setSearchTerm(''); setShowReserveSearch(true); }}
                        className="bg-gray-100 text-gray-600 p-2 rounded-full hover:bg-gray-200"
                    >
                        <UserPlus className="w-4 h-4" />
                    </button>
                </div>

                {reserveList.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-4 italic">No hay reservas anotadas</p>
                ) : (
                    <ul className="space-y-2 mb-4">
                        {reserveList.map(r => (
                            <li key={r.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="bg-gray-200 text-gray-600 text-xs font-mono px-1.5 py-0.5 rounded shrink-0">{r.id}</span>
                                    <span className="text-sm font-medium text-gray-700 truncate">{r.name}</span>
                                </div>
                                <button onClick={() => removeReserve(r.id)} className="text-red-400 hover:text-red-600 shrink-0 ml-2"><XCircle className="w-4 h-4"/></button>
                            </li>
                        ))}
                    </ul>
                )}

                {/* MODAL BUSCADOR RESERVAS */}
                {showReserveSearch && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-4 shadow-xl">
                            <div className="flex justify-between mb-2">
                                <h3 className="font-bold">Añadir Reserva</h3>
                                <button onClick={() => setShowReserveSearch(false)}><XCircle className="w-5 h-5 text-gray-400"/></button>
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar socio..."
                                className="w-full p-2 border rounded-lg mb-2"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                            <div className="max-h-48 overflow-y-auto">
                                {allMembers.filter(m => 
                                    (m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.includes(searchTerm)) &&
                                    !reserveList.find(r => r.id === m.id) &&
                                    (m.paid.toUpperCase() === 'SI' || m.paid.toUpperCase() === 'SÍ')
                                ).slice(0,10).map(m => (
                                    <button 
                                        key={m.id} 
                                        onClick={() => handleAddReserve(m)}
                                        className="w-full text-left p-2 hover:bg-blue-50 text-sm border-b flex items-center gap-2"
                                    >
                                        <span className="bg-gray-100 text-gray-500 text-xs font-mono px-1.5 py-0.5 rounded min-w-[28px] text-center">{m.id}</span>
                                        <span className="truncate">{m.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* SORTEO DE RESERVAS */}
                {reserveList.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-bold text-gray-500 uppercase">Huecos libres:</span>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    min="0" 
                                    max="10" 
                                    value={reserveSpotsNeeded}
                                    readOnly
                                    className="w-16 p-1 text-center border rounded bg-gray-100 text-gray-500 text-sm font-bold cursor-not-allowed"
                                />
                                <span className="absolute -top-3 -right-2 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-400 ml-1">(Calculado autom.)</span>
                        </div>
                        <button 
                            onClick={runReserveRaffle}
                            className="w-full py-2 bg-gray-800 text-white text-sm font-bold rounded-xl hover:bg-black transition-all flex justify-center gap-2"
                        >
                            <Shuffle className="w-4 h-4" /> Sortear entre Reservas
                        </button>
                        
                        {reserveWinners.length > 0 && (
                            <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-3 animate-in fade-in">
                                <h4 className="text-xs font-bold text-green-800 mb-2 uppercase text-center">🎉 Reservas Premiados</h4>
                                <ul className="text-sm space-y-1">
                                    {reserveWinners.map(w => (
                                        <li key={w.id} className="text-green-900 font-medium flex items-center gap-2">
                                            <CheckCircle className="w-3 h-3" /> {w.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      ) : (
        // --- PESTAÑA: HISTORIAL (NUEVO) ---
        <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2 px-1">
                <Archive className="w-5 h-5 text-gray-500" /> Historial de Jornadas
            </h2>

            {/* BUSCADOR DE HISTORIAL */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Buscar socio (Nombre o ID)..." 
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-depor-blue/20 transition-all text-sm font-medium"
                        value={historySearchTerm}
                        onChange={(e) => {
                            setHistorySearchTerm(e.target.value);
                            setSelectedHistoryMember(null); // Reset selection on new search
                        }}
                    />
                    <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
                </div>
                
                {historySearchTerm && !selectedHistoryMember && (
                    <div className="mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-lg absolute w-[calc(100%-2rem)] max-w-[26rem] z-20">
                         {filteredMembersForHistory.length > 0 ? filteredMembersForHistory.map(m => (
                             <button
                                key={m.id}
                                onClick={() => {
                                    setSelectedHistoryMember(m);
                                    setHistorySearchTerm('');
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-0 border-gray-50 flex items-center justify-between"
                             >
                                <span className="text-sm font-medium text-gray-700 truncate">{m.name}</span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-500">ID: {m.id}</span>
                             </button>
                         )) : (
                             <p className="p-3 text-center text-sm text-gray-400">No se encontraron socios</p>
                         )}
                    </div>
                )}
            </div>

            {/* FICHA DE SOCIO SELECCIONADO */}
            {selectedHistoryMember && (() => {
                const stats = getMemberHistory(selectedHistoryMember.id);
                // Total Wins = App Wins + Sheet Imported Wins
                const totalWinsCount = stats.wins.length + stats.importedWins.length;
                
                return (
                    <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 shadow-sm animate-in zoom-in-95">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-depor-blue text-white flex items-center justify-center font-bold text-lg shadow-md">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 leading-tight">{selectedHistoryMember.name}</h3>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {selectedHistoryMember.id}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedHistoryMember(null)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Total Ganador</p>
                                <p className="text-2xl font-black text-depor-blue">{totalWinsCount}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Veces Reserva</p>
                                <p className="text-2xl font-black text-gray-500">{stats.reserves.length}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* 1. REGISTROS LOCALES (APP) */}
                            {stats.wins.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-1">
                                        <Trophy className="w-3 h-3"/> Ganador (App):
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {stats.wins.map(r => (
                                            <span key={r.id} className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded-md font-bold border border-green-200">
                                                {r.matchName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 2. REGISTROS IMPORTADOS (EXCEL) - NUEVO */}
                            {stats.importedWins.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-purple-700 uppercase mb-2 flex items-center gap-1">
                                        <Database className="w-3 h-3"/> Registros Previos (Excel):
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {stats.importedWins.map((winName, idx) => (
                                            <span key={`imported-${idx}`} className="text-[10px] bg-purple-100 text-purple-800 px-2 py-1 rounded-md font-bold border border-purple-200">
                                                {winName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* 3. RESERVAS */}
                             {stats.reserves.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                        <ClipboardList className="w-3 h-3"/> Anotado Reserva en:
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {stats.reserves.map(r => (
                                            <span key={r.id} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium border border-gray-200">
                                                {r.matchName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {totalWinsCount === 0 && stats.reserves.length === 0 && (
                                <p className="text-sm text-gray-400 italic text-center py-2">Sin actividad registrada en el historial.</p>
                            )}
                        </div>
                    </div>
                );
            })()}

            {matchHistory.length === 0 ? (
                 <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <p className="italic">No hay jornadas cerradas todavía.</p>
                 </div>
            ) : (
                matchHistory.map((record) => (
                    <div key={record.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">{record.matchName}</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <Calendar className="w-3 h-3"/> {new Date(record.date).toLocaleDateString()}
                                </p>
                            </div>
                            <span className="text-[10px] bg-gray-200 px-2 py-1 rounded-full font-bold text-gray-600">
                                {record.winners.length} Premiados
                            </span>
                        </div>
                        
                        <div className="p-4 space-y-4">
                            <div>
                                <h4 className="text-xs font-bold text-orange-800 uppercase mb-2 flex items-center gap-1">
                                    <Trophy className="w-3 h-3"/> Socios Premiados
                                </h4>
                                <div className="bg-orange-50/50 rounded-xl p-2 grid grid-cols-1 gap-1">
                                    {record.winners.map((w, i) => (
                                        <div key={w.id} className="text-xs flex gap-2 items-center text-gray-700">
                                            <span className="font-mono text-orange-300 w-4">{i+1}.</span>
                                            <span className="bg-white border border-orange-100 px-1 rounded text-[10px] text-gray-500 font-mono">{w.id}</span>
                                            <span className="truncate">{w.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {record.reserves.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                        <ClipboardList className="w-3 h-3"/> Lista Reservas
                                    </h4>
                                    <div className="bg-gray-50 rounded-xl p-2">
                                        {record.reserves.map(r => (
                                             <div key={r.id} className="text-xs flex gap-2 items-center text-gray-500 mb-1 last:mb-0">
                                                <span className="bg-white border border-gray-200 px-1 rounded text-[10px] font-mono">{r.id}</span>
                                                <span className="truncate">{r.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
      )}


      {/* --- MODAL DE ASIGNACIÓN (BUSCADOR PARA GESTIÓN) --- */}
      {assignmentModalOpen && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex flex-col items-center justify-start sm:justify-center p-4 pt-20">
              <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300 relative max-h-[80vh] flex flex-col">
                  
                  <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Asignar Abono #{currentSlotId}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {PASS_SLOTS.find(s => s.slotId === currentSlotId)?.seatInfo}
                        </p>
                      </div>
                      <button 
                        onClick={() => setAssignmentModalOpen(false)} 
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full bg-gray-50"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                  </div>

                  {/* Buscador */}
                  <div className="relative mb-4 shrink-0">
                      <input
                          type="text"
                          placeholder="Buscar socio por Nombre o ID..."
                          autoFocus
                          className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-depor-blue/20 focus:bg-white transition-all font-medium"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      <Search className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                  </div>

                  {/* Lista de Resultados */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {assignments[currentSlotId!] && (
                          <button 
                            onClick={handleUnassignMember}
                            className="w-full p-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-medium flex items-center justify-center gap-2 hover:bg-red-100 transition-colors mb-4"
                          >
                              <XCircle className="w-4 h-4" /> Dejar vacío (Desasignar)
                          </button>
                      )}

                      {filteredMembersForAssignment.slice(0, 20).map(member => {
                          // Check if member is assigned to ANY slot EXCEPT the current one
                          const isAssignedElsewhere = (Object.values(assignments) as Member[]).some(m => m.id === member.id && assignments[currentSlotId!]?.id !== member.id);
                          
                          return (
                              <button
                                  key={member.id}
                                  onClick={() => !isAssignedElsewhere && handleAssignMember(member)}
                                  disabled={isAssignedElsewhere}
                                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                                      isAssignedElsewhere 
                                      ? 'opacity-50 bg-gray-50 border-gray-100 cursor-not-allowed' 
                                      : 'bg-white border-gray-100 hover:border-depor-blue hover:bg-blue-50/50'
                                  }`}
                              >
                                  <div>
                                      <p className="font-bold text-gray-800 text-sm group-hover:text-depor-blue">{member.name}</p>
                                      <span className="text-xs text-gray-400 font-mono">ID: {member.id}</span>
                                  </div>
                                  {isAssignedElsewhere ? (
                                      <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-1 rounded">Ya asignado</span>
                                  ) : (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${member.paid.toLowerCase() === 'si' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {member.paid.toLowerCase() === 'si' ? 'ACTIVO' : 'PENDIENTE'}
                                      </span>
                                  )}
                              </button>
                          );
                      })}
                      
                      {filteredMembersForAssignment.length === 0 && (
                          <p className="text-center text-gray-400 text-sm py-4">No se encontraron socios</p>
                      )}
                  </div>
              </div>
          </div>
      )}


      {/* QUICK SHARE MODAL */}
      {quickShareData && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex flex-col items-center justify-end sm:justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300 relative">
                <button onClick={closeQuickShare} className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 rounded-full bg-gray-50">
                    <XCircle className="w-6 h-6" />
                </button>

                <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">Compartir Abono</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Para <span className="font-bold text-gray-800">{getFirstName(quickShareData.member.name)}</span>.
                    </p>
                </div>

                {/* Render hidden card using the SLOT IMAGE */}
                <div className="fixed left-[-9999px]">
                    <div id={`quick-card-${quickShareData.member.id}`}>
                        <CardCanvas 
                            memberId={quickShareData.member.id} 
                            memberName={quickShareData.member.name} 
                            imageUrl={quickShareData.imageUrl} 
                            referenceTimestamp={lastResetTime} 
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Globe className="w-3 h-3" /> Enlace Web
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                             <a 
                                href={getWhatsAppMessage(quickShareData.member, generateLinkForMember(quickShareData.member, lastResetTime, quickShareData.slotId))}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-center bg-[#25D366] text-white font-bold py-3 px-2 rounded-lg hover:bg-[#20ba59] transition-all shadow-sm active:scale-[0.98] gap-2 text-xs"
                            >
                                <Send className="w-4 h-4" /> WhatsApp
                            </a>
                            <button 
                                onClick={() => copyToClipboard(generateLinkForMember(quickShareData.member, lastResetTime, quickShareData.slotId))}
                                className="flex items-center justify-center bg-white border border-gray-200 text-gray-700 font-bold py-3 px-2 rounded-lg hover:bg-gray-50 transition-all shadow-sm active:scale-[0.98] gap-2 text-xs"
                            >
                                {copied ? <CheckCircle className="w-4 h-4 text-green-500"/> : <Copy className="w-4 h-4"/>}
                                {copied ? 'Copiado' : 'Copiar Enlace'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                         <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <ImageIcon className="w-3 h-3" /> Imagen
                        </h4>
                        <button 
                             onClick={() => downloadCardImage(`quick-card-${quickShareData.member.id}`, `Abono_${quickShareData.member.name}`)}
                             className="flex items-center justify-center w-full bg-white border border-gray-300 text-gray-700 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-all shadow-sm active:scale-[0.98] gap-2 text-sm"
                        >
                            <Download className="w-4 h-4" /> Descargar PNG
                        </button>
                    </div>
                </div>
             </div>
        </div>
      )}

      {/* FULL PREVIEW MODAL */}
      {selectedPreviewData && (
        <div className="fixed inset-0 bg-neutral-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300 relative max-h-[90vh] flex flex-col">
            <button onClick={closePreview} className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-20">
                <XCircle className="w-8 h-8" />
            </button>
            <div className="mb-4 text-center shrink-0">
                <h3 className="text-xl font-bold text-gray-900">Vista Previa</h3>
                <p className="text-sm text-gray-500">Abono asignado a {selectedPreviewData.member.name}</p>
            </div>
            <div className="bg-gray-100 rounded-2xl p-4 mb-6 flex justify-center border-inner shadow-inner overflow-y-auto relative min-h-[300px] items-start shrink-0">
               <div className="w-full flex justify-center mt-6 mb-6">
                  <div id={`preview-card-${selectedPreviewData.member.id}`}>
                      <CardCanvas 
                        memberId={selectedPreviewData.member.id} 
                        memberName={selectedPreviewData.member.name} 
                        imageUrl={selectedPreviewData.imageUrl} 
                        referenceTimestamp={lastResetTime} 
                      />
                  </div>
               </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 shrink-0">
               <a 
                href={getWhatsAppMessage(selectedPreviewData.member, generateLinkForMember(selectedPreviewData.member, lastResetTime, selectedPreviewData.slotId))}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-[#25D366] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#20ba59] transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Send className="w-4 h-4" /> WhatsApp
              </a>
               <button 
                onClick={() => downloadCardImage(`preview-card-${selectedPreviewData.member.id}`, `Abono_${selectedPreviewData.member.name}`)}
                className="w-full bg-gray-900 text-white font-bold py-3 px-4 rounded-xl hover:bg-black transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /> Descargar PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-Component: Secure Viewer (Public View) ---
const SecureViewer: React.FC = () => {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [referenceTimestamp, setReferenceTimestamp] = useState<number | undefined>(undefined);
  const [forcedImageUrl, setForcedImageUrl] = useState<string | undefined>(undefined);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
        const hash = window.location.hash;
        const queryString = hash.split('?')[1];
        const urlParams = new URLSearchParams(queryString);
        const id = urlParams.get('id');
        const timestampStr = urlParams.get('t'); 
        const slotIdStr = urlParams.get('slot'); // Leer Slot ID

        if (!id) {
            setError('Enlace inválido: falta el ID del socio.');
            setLoading(false);
            return;
        }

        // 1. VALIDAR CADUCIDAD
        if (timestampStr) {
            const timestamp = parseInt(timestampStr);
            setReferenceTimestamp(timestamp);
            const expirationTime = timestamp + (96 * 60 * 60 * 1000); // 96h
            if (Date.now() > expirationTime) {
                setIsExpired(true);
                setLoading(false);
                return;
            }
        }

        // 2. FORZAR IMAGEN DEL SLOT (Solución problema "Tarjeta Incorrecta")
        if (slotIdStr) {
            const slotId = parseInt(slotIdStr);
            const slotConfig = PASS_SLOTS.find(s => s.slotId === slotId);
            if (slotConfig) {
                setForcedImageUrl(slotConfig.imageUrl);
            }
        }

        // 3. CARGAR SOCIO
        try {
            const allMembers = await fetchMembers();
            const found = allMembers.find(m => m.id === id);
            if (found) {
                setMember(found);
            } else {
                setError('Socio no encontrado.');
            }
        } catch (e) {
            setError('Error de conexión con la base de datos.');
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white"><RefreshCw className="animate-spin mr-2" /> Cargando...</div>;

  if (isExpired) return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-900 p-8 text-center text-white">
          <div className="bg-red-500/20 p-6 rounded-full mb-6">
            <AlertTriangle className="w-16 h-16 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Enlace Caducado</h1>
          <p className="text-gray-400 max-w-xs">Este pase de acceso ha expirado por seguridad. Contacta con la Peña.</p>
      </div>
  );

  if (error || !member) return <div className="min-h-screen flex items-center justify-center bg-neutral-900 p-8 text-center text-red-400 font-bold">{error}</div>;

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center secure-view">
      <div className="bg-green-500/10 px-5 py-2 mb-6 rounded-full border border-green-500/30">
          <p className="text-green-400 text-xs font-bold tracking-widest flex items-center gap-2 uppercase"><CheckCircle className="w-4 h-4"/> Pase Verificado</p>
      </div>
      
      {/* 
        CRÍTICO: Usamos 'forcedImageUrl' si existe (viene del slot). 
        Si no, usamos 'member.imageUrl' como fallback. 
      */}
      <CardCanvas 
        memberId={member.id} 
        memberName={member.name} 
        imageUrl={forcedImageUrl || member.imageUrl} 
        referenceTimestamp={referenceTimestamp}
      />
    </div>
  );
};

const App: React.FC = () => {
  const [route, setRoute] = useState<'dashboard' | 'view'>('dashboard');
  useEffect(() => {
    const handleRoute = () => {
      const hash = window.location.hash;
      setRoute(hash.includes('/view') ? 'view' : 'dashboard');
    };
    handleRoute(); 
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  return <>{route === 'dashboard' ? <Dashboard /> : <SecureViewer />}</>;
};

export default App;
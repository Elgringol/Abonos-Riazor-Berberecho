import React, { useState, useEffect, useMemo } from 'react';
import { toBlob } from 'html-to-image';
import { fetchMembers, DEFAULT_IMAGES } from './services/googleSheet';
import { loadCloudData, saveCloudData, AppState, CLOUD_API_URL } from './services/cloudBridge';
import { Member, MatchHistoryRecord } from './types';
import { generateWhatsAppLink } from './utils';
import CardCanvas from './components/CardCanvas';
import { Search, Share2, CheckCircle, RefreshCw, XCircle, Eye, Send, Pencil, UserPlus, Users, RotateCcw, AlertTriangle, Trophy, Ticket, ClipboardList, Shuffle, ArrowRightCircle, Calendar, Check, X, MessageCircle, History, Archive, Save, User, Cloud, CloudOff, CloudLightning, RefreshCcw, Link, Loader2 } from 'lucide-react';

// --- Constantes Visuales ---
const LOGO_ID = "10m8lfNupdyr8st5zXKE5xobx-NsciILT";
const LOGO_URL = `https://drive.google.com/thumbnail?id=${LOGO_ID}&sz=w800`;
const RAFFLE_BG_URL = "https://drive.google.com/thumbnail?id=16VQH_e1nCpqc52vRHPRKYzrCTLDSTXpc&sz=w1080"; 
const CURRENT_SEASON = "25/26"; 

// Definición estática de los asientos para el modo "Fail-Safe"
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

// --- Helpers ---
const getFirstName = (fullName: string) => {
  if (!fullName) return 'Socio';
  const cleanName = fullName.trim();
  if (cleanName.includes(',')) {
      const namePart = cleanName.split(',')[1].trim();
      return namePart.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  const words = cleanName.split(/\s+/);
  if (words.length >= 3) {
      const nameParts = words.slice(2); 
      return nameParts.join(' ').toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  if (words.length === 2) {
      return words[1].toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
  }
  return words[0].toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());
};

const generateLinkForMember = (member: Member, referenceTimestamp?: number, slotId?: number): string => {
    let baseUrl = "";
    if (window.location.origin && window.location.origin !== 'null') {
         baseUrl = `${window.location.origin}${window.location.pathname}`;
    } else {
         baseUrl = window.location.href.split('#')[0].split('?')[0];
    }
    baseUrl = baseUrl.replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('id', member.id);
    if (referenceTimestamp) params.set('t', referenceTimestamp.toString());
    if (slotId) params.set('slot', slotId.toString());
    return `${baseUrl}/#/view?${params.toString()}`;
};

const getWhatsAppMessage = (member: Member, link: string) => {
    const firstName = getFirstName(member.name);
    return generateWhatsAppLink(member.phone, `👋 Hola *${firstName.toUpperCase()}*,\n\n🔵⚪ *TU ABONO DIGITAL - DÉPOR*\n\nAquí tienes tu enlace de acceso único para entrar en Riazor:\n👇👇👇\n${link}\n\n🚨 *INSTRUCCIONES IMPORTANTES:*\n1️⃣ 🔆 Sube el *BRILLO* de tu móvil al máximo.\n2️⃣ 📲 Muestra el *CÓDIGO DE BARRAS* en el torno.\n3️⃣ ❌ *NO* uses captura de pantalla (el pase caduca).\n\n¡Nos vemos en Riazor! ¡Forza Dépor!`);
};

const getRaffleWinnerMessage = (member: Member, matchName: string) => {
    const firstName = getFirstName(member.name);
    return generateWhatsAppLink(member.phone, `👋 Hola *${firstName.toUpperCase()}*,\n\n🎉 Te informamos que has sido agraciado con un abono para presenciar el encuentro *${matchName.toUpperCase()}*.\n\n⚠️ En caso de querer asistir debes confirmarlo respondiendo a este mensaje antes de las *15:00 H del Jueves previo al partido*, a partir de ese momento pasará a disposición de un socio reserva.\n\n📲 Puede seguir todos los sorteos y noticias de la Peña uniéndose a nuestro Canal: https://whatsapp.com/channel/0029Vat7ZB0Id7nS4Ri1L825`);
};

const reconstructCycleHistory = (history: MatchHistoryRecord[]): string[] => {
    let cycleIds: Set<string> = new Set();
    // Procesamos el historial cronológicamente
    const sortedHistory = [...history].sort((a, b) => a.date - b.date);
    sortedHistory.forEach(match => {
        if (match.isCycleReset) cycleIds.clear();
        match.winners.forEach(w => cycleIds.add(w.id));
    });
    return Array.from(cycleIds);
};

type WinnerStatus = 'pending' | 'confirmed' | 'rejected';

// --- Dashboard Component ---
const Dashboard: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'tickets' | 'raffle' | 'history'>('tickets');
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'synced'>('idle');
  const [isCloudConfigured, setIsCloudConfigured] = useState(false);
  
  // State: Assignments & History
  const [assignments, setAssignments] = useState<Record<number, Member>>({});
  const [lastResetTime, setLastResetTime] = useState<number>(Date.now());
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRecord[]>([]);
  const [cycleHistory, setCycleHistory] = useState<string[]>([]);
  
  // State: Active Raffle
  const [matchName, setMatchName] = useState('');
  const [raffleWinners, setRaffleWinners] = useState<Member[]>([]);
  const [winnersStatus, setWinnersStatus] = useState<Record<string, WinnerStatus>>({});
  const [reserveList, setReserveList] = useState<Member[]>([]);
  const [reserveWinners, setReserveWinners] = useState<Member[]>([]);
  const [wasCycleResetInCurrentRaffle, setWasCycleResetInCurrentRaffle] = useState(false);

  // UI States
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [currentSlotId, setCurrentSlotId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPreviewData, setSelectedPreviewData] = useState<{member: Member, imageUrl: string, slotId: number} | null>(null);
  const [quickShareData, setQuickShareData] = useState<{member: Member, imageUrl: string, slotId: number} | null>(null);
  const [reserveSpotsNeeded, setReserveSpotsNeeded] = useState(1);
  const [showReserveSearch, setShowReserveSearch] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [selectedHistoryMember, setSelectedHistoryMember] = useState<Member | null>(null);
  const [selectedSeasonFilter, setSelectedSeasonFilter] = useState<string>('all');
  const [isProcessingRaffleImage, setIsProcessingRaffleImage] = useState(false);

  useEffect(() => { refreshAllData(); }, []);

  const refreshAllData = async () => {
      setLoading(true);
      setSyncStatus('syncing');
      const isConfigured = !(!CLOUD_API_URL || CLOUD_API_URL.includes("PASTE_YOUR"));
      setIsCloudConfigured(isConfigured);

      try {
          // 1. Cargar Socios (Siempre fresco)
          const membersData = await fetchMembers();
          setAllMembers(membersData);

          // 2. Intentar carga Cloud
          let cloudState = await loadCloudData();
          const isCloudEmpty = !cloudState || (!cloudState.lastResetTime && !cloudState.assignments);

          if (cloudState && !isCloudEmpty) {
              // --- RECUPERACIÓN DE DATOS DE LA NUBE ---
              setAssignments(cloudState.assignments || {});
              setMatchHistory(cloudState.matchHistory || []);
              setLastResetTime(cloudState.lastResetTime || Date.now());
              
              const cleanCycleHistory = reconstructCycleHistory(cloudState.matchHistory || []);
              setCycleHistory(cleanCycleHistory);

              // Recuperar Sorteo Activo + Reservas
              if (cloudState.activeRaffle) {
                  setMatchName(cloudState.activeRaffle.matchName || '');
                  setRaffleWinners(cloudState.activeRaffle.winners || []);
                  setWinnersStatus(cloudState.activeRaffle.winnersStatus as Record<string, WinnerStatus> || {});
                  // Recuperación crítica de reservas
                  setReserveList(cloudState.activeRaffle.reserveList || []);
                  setReserveWinners(cloudState.activeRaffle.reserveWinners || []);
                  setWasCycleResetInCurrentRaffle(!!cloudState.activeRaffle.isCycleReset);
              } else {
                  setWasCycleResetInCurrentRaffle(false);
                  setMatchName('');
                  setRaffleWinners([]);
                  setReserveList([]);
              }
              setSyncStatus('synced');
          } else {
              // 3. Fallback a Local Storage si falla la nube
              const savedAssignments = localStorage.getItem('slot_assignments');
              const localAssignments = savedAssignments ? JSON.parse(savedAssignments) : {};
              setAssignments(localAssignments);
              
              const savedHistory = localStorage.getItem('raffle_match_history_v2');
              const localMatchHistory = savedHistory ? JSON.parse(savedHistory) : [];
              setMatchHistory(localMatchHistory);
              
              const cleanCycleHistory = reconstructCycleHistory(localMatchHistory);
              setCycleHistory(cleanCycleHistory);
              
              const savedTime = localStorage.getItem('last_reset_time');
              const localLastResetTime = savedTime ? parseInt(savedTime) : Date.now();
              setLastResetTime(localLastResetTime);
              
              setSyncStatus('idle');

              // Migración inicial a la nube si está vacía
              if (isConfigured && isCloudEmpty) {
                  const hasLocalData = Object.keys(localAssignments).length > 0 || localMatchHistory.length > 0;
                  if (hasLocalData) {
                      const migrationState: AppState = { assignments: localAssignments, matchHistory: localMatchHistory, cycleHistory: cleanCycleHistory, lastResetTime: localLastResetTime, activeRaffle: null };
                      await saveCloudData(migrationState);
                      setSyncStatus('synced');
                  }
              }
          }
      } catch (e) {
          console.error("Error cargando datos", e);
          setSyncStatus('error');
      } finally {
          setLoading(false);
      }
  };

  const persistState = async (overrides: Partial<AppState> = {}) => {
      setSyncStatus('syncing');
      
      // Construir estado completo
      const currentState: AppState = { 
          assignments, 
          matchHistory, 
          cycleHistory, 
          lastResetTime, 
          activeRaffle: { 
              matchName, 
              winners: raffleWinners, 
              winnersStatus, 
              reserveList, 
              reserveWinners, 
              timestamp: Date.now(), 
              isCycleReset: wasCycleResetInCurrentRaffle 
          }, 
          ...overrides 
      };

      // Guardar Local
      localStorage.setItem('slot_assignments', JSON.stringify(currentState.assignments));
      localStorage.setItem('raffle_match_history_v2', JSON.stringify(currentState.matchHistory));
      localStorage.setItem('raffle_cycle_history_v2', JSON.stringify(currentState.cycleHistory));
      localStorage.setItem('last_reset_time', currentState.lastResetTime.toString());
      
      // Guardar Nube
      const success = await saveCloudData(currentState);
      setSyncStatus(success ? 'synced' : 'error');
  };

  // Efecto para calcular huecos de reserva necesarios
  useEffect(() => {
    if (raffleWinners.length > 0) {
        const confirmedCount = Object.values(winnersStatus).filter(s => s === 'confirmed').length;
        setReserveSpotsNeeded(Math.max(0, 10 - confirmedCount));
    }
  }, [winnersStatus, raffleWinners]);

  const raffleStats = useMemo(() => {
      const activeMembers = allMembers.filter(m => m.paid === 'SI');
      const pendingToWin = activeMembers.filter(m => !cycleHistory.includes(m.id) && !(m.history && m.history.length > 0));
      return { 
          total: allMembers.length, 
          active: activeMembers.length, 
          pending: pendingToWin.length
      };
  }, [allMembers, cycleHistory]);

  const runMainRaffle = () => {
      if (!matchName.trim()) { alert("Introduce el nombre del partido."); return; }
      
      const eligibleMembers = allMembers.filter(m => m.paid.toUpperCase() === 'SI' || m.paid.toUpperCase() === 'SÍ');
      let winners: Member[] = [];
      let cycleResetOccurred = false;
      
      let availableInCycle = eligibleMembers.filter(m => !cycleHistory.includes(m.id) && !(m.history && m.history.length > 0));

      if (availableInCycle.length < 10) {
          // No hay suficientes en el ciclo actual -> RESET
          winners = [...availableInCycle];
          const winnersIds = new Set(winners.map(w => w.id));
          const refreshedPot = eligibleMembers.filter(m => !winnersIds.has(m.id));
          const spotsNeeded = 10 - winners.length;
          
          const shuffledPot = [...refreshedPot].sort(() => 0.5 - Math.random());
          winners = [...winners, ...shuffledPot.slice(0, spotsNeeded)];
          cycleResetOccurred = true;
      } else {
          // Sorteo normal
          const shuffled = [...availableInCycle].sort(() => 0.5 - Math.random());
          winners = shuffled.slice(0, 10);
      }

      setRaffleWinners(winners); 
      setWinnersStatus({}); 
      setReserveWinners([]); 
      setWasCycleResetInCurrentRaffle(cycleResetOccurred);

      persistState({ 
          activeRaffle: { 
              matchName, 
              winners, 
              winnersStatus: {}, 
              reserveList, 
              reserveWinners: [], 
              timestamp: Date.now(), 
              isCycleReset: cycleResetOccurred 
          } 
      });

      if (cycleResetOccurred) alert("ℹ️ CICLO COMPLETADO: Se reiniciarán las exclusiones al guardar esta jornada.");
  };

  const updateWinnerStatus = (memberId: string, status: WinnerStatus) => {
      const newStatus = { ...winnersStatus, [memberId]: winnersStatus[memberId] === status ? 'pending' : status };
      setWinnersStatus(newStatus);
      persistState({ 
          activeRaffle: { 
              matchName, 
              winners: raffleWinners, 
              reserveList, 
              reserveWinners, 
              timestamp: Date.now(), 
              winnersStatus: newStatus, 
              isCycleReset: wasCycleResetInCurrentRaffle 
          } 
      });
  };

  const transferWinnersToSlots = () => {
      const confirmed = raffleWinners.filter(w => winnersStatus[w.id] === 'confirmed');
      const finalList = [...confirmed, ...reserveWinners]; // Incluimos reservas premiados
      
      if (finalList.length === 0) { alert("⚠️ No hay socios confirmados."); return; }
      
      const now = Date.now();
      const newAssignments: Record<number, Member> = {};
      
      finalList.slice(0, 10).forEach((member, index) => { newAssignments[index + 1] = member; });
      
      setAssignments(newAssignments); 
      setLastResetTime(now); 
      setCurrentTab('tickets');
      
      persistState({ assignments: newAssignments, lastResetTime: now });
      alert(`✅ ASIGNACIÓN COMPLETADA`);
  };
  
  const handleCloseMatchday = () => {
      if (!matchName.trim() || raffleWinners.length === 0) return;
      if (!window.confirm("¿Cerrar jornada y guardar en Historial?")) return;
      
      // Guardamos la lista completa de reservas en el historial para consulta futura
      const newRecord: MatchHistoryRecord = { 
          id: Date.now().toString(), 
          date: Date.now(), 
          matchName: matchName, 
          season: CURRENT_SEASON, 
          isCycleReset: wasCycleResetInCurrentRaffle, 
          winners: [...raffleWinners], 
          reserves: [...reserveList] 
      };
      
      const newHistory = [newRecord, ...matchHistory];
      setMatchHistory(newHistory);
      
      const updatedCycleHistory = reconstructCycleHistory(newHistory);
      setCycleHistory(updatedCycleHistory);
      
      // Limpiar estado del sorteo
      setMatchName(''); 
      setRaffleWinners([]); 
      setReserveList([]); 
      setReserveWinners([]); 
      setWinnersStatus({}); 
      setWasCycleResetInCurrentRaffle(false);
      
      persistState({ matchHistory: newHistory, cycleHistory: updatedCycleHistory, activeRaffle: null });
      alert("✅ Jornada cerrada."); 
      setCurrentTab('history');
  };

  const handleAddReserve = (member: Member) => {
      if (!reserveList.find(m => m.id === member.id)) {
          const newList = [...reserveList, member];
          setReserveList(newList); setShowReserveSearch(false); setSearchTerm('');
          persistState({ activeRaffle: { matchName, winners: raffleWinners, winnersStatus, reserveWinners, timestamp: Date.now(), reserveList: newList, isCycleReset: wasCycleResetInCurrentRaffle } });
      }
  };

  const removeReserve = (id: string) => {
      const newList = reserveList.filter(m => m.id !== id);
      setReserveList(newList);
      persistState({ activeRaffle: { matchName, winners: raffleWinners, winnersStatus, reserveWinners, timestamp: Date.now(), reserveList: newList, isCycleReset: wasCycleResetInCurrentRaffle } });
  };

  const runReserveRaffle = () => {
      if (reserveList.length === 0 || reserveSpotsNeeded <= 0) return;
      const shuffled = [...reserveList].sort(() => 0.5 - Math.random());
      const winners = shuffled.slice(0, reserveSpotsNeeded);
      setReserveWinners(winners);
      persistState({ activeRaffle: { matchName, winners: raffleWinners, winnersStatus, reserveList, timestamp: Date.now(), reserveWinners: winners, isCycleReset: wasCycleResetInCurrentRaffle } });
  };

  const handleFullReset = async () => {
      if (!window.confirm("⚠️ ¿RESET COMPLETO? (Borrará asignaciones)")) return;
      setLoading(true);
      try {
          setAssignments({}); const now = Date.now(); setLastResetTime(now);
          const data = await fetchMembers(); setAllMembers(data);
          await persistState({ assignments: {}, lastResetTime: now });
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleAssignMember = (member: Member) => {
      if (currentSlotId !== null) {
          const newAssignments = { ...assignments, [currentSlotId]: member };
          setAssignments(newAssignments); setAssignmentModalOpen(false); setCurrentSlotId(null);
          persistState({ assignments: newAssignments });
      }
  };

  const handleUnassignMember = () => {
       if (currentSlotId !== null) {
          const newAssignments = { ...assignments };
          delete newAssignments[currentSlotId];
          setAssignments(newAssignments); setAssignmentModalOpen(false); setCurrentSlotId(null);
          persistState({ assignments: newAssignments });
      }
  };

  const handleCopyRaffleImage = async () => {
      if (isProcessingRaffleImage) return;
      const node = document.getElementById('raffle-card');
      if (!node) return;
      
      setIsProcessingRaffleImage(true);
      document.body.style.cursor = 'wait';

      try {
          await new Promise(r => setTimeout(r, 50));
          const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
          
          if (!blob) throw new Error("Blob generado vacío");
          
          try { 
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); 
              alert("📋 ¡Imagen del sorteo copiada!"); 
          } catch (e) { 
              const link = document.createElement('a'); 
              link.download = `Sorteo_${matchName}.png`; 
              link.href = URL.createObjectURL(blob); 
              link.click(); 
          }
      } catch (e) { 
          console.error(e); 
          alert("No se pudo copiar la imagen.");
      } finally {
          setIsProcessingRaffleImage(false);
          document.body.style.cursor = 'default';
      }
  };

  const handleCopyLink = async (member: Member, slotId: number) => {
      const link = generateLinkForMember(member, lastResetTime, slotId);
      try { await navigator.clipboard.writeText(link); alert("✅ Enlace copiado al portapapeles"); } 
      catch (err) { alert("❌ No se pudo copiar el enlace"); }
  };

  const openAssignmentModal = (slotId: number) => { setCurrentSlotId(slotId); setSearchTerm(''); setAssignmentModalOpen(true); };
  
  const getMemberHistory = (memberId: string) => {
      const wins = matchHistory.filter(r => r.winners.some(w => w.id === memberId));
      const reserves = matchHistory.filter(r => r.reserves.some(res => res.id === memberId));
      const member = allMembers.find(m => m.id === memberId);
      const importedWins = member?.history || [];
      return { wins, reserves, importedWins };
  };

  const handlePreview = (slotId: number, imageUrl: string) => {
    const member = assignments[slotId];
    if (member) setSelectedPreviewData({ member, imageUrl, slotId });
  };
  
  const handleQuickShare = (slotId: number, imageUrl: string) => {
    const member = assignments[slotId];
    if (member) { setQuickShareData({ member, imageUrl, slotId }); }
  };
  const closePreview = () => setSelectedPreviewData(null);
  const closeQuickShare = () => setQuickShareData(null);
  
  const filteredMembersForAssignment = (allMembers as Member[]).filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredMembersForHistory = (allMembers as Member[]).filter(m => historySearchTerm && (m.name.toLowerCase().includes(historySearchTerm.toLowerCase()) || m.id.toLowerCase().includes(historySearchTerm.toLowerCase()))).slice(0, 5);
  const availableSeasons = useMemo(() => {
    const seasons = new Set<string>();
    matchHistory.forEach(r => { if (r.season) seasons.add(r.season); else seasons.add('Anteriores'); });
    seasons.add(CURRENT_SEASON);
    return Array.from(seasons).sort().reverse();
  }, [matchHistory]);
  const filteredHistory = useMemo(() => {
    if (selectedSeasonFilter === 'all') return matchHistory;
    return matchHistory.filter(r => { const season = r.season || 'Anteriores'; return season === selectedSeasonFilter; });
  }, [matchHistory, selectedSeasonFilter]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24 font-sans">
      {/* HEADER */}
      <header className="-mx-4 -mt-4 mb-6 text-center pt-10 pb-6 bg-white rounded-b-[2.5rem] shadow-sm border-b border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-depor-blue/5 rounded-b-[50%] -z-10"></div>
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
             <button onClick={refreshAllData} disabled={syncStatus === 'syncing'} className={`p-2 rounded-full transition-all ${syncStatus === 'syncing' ? 'bg-blue-100 text-depor-blue' : 'bg-white text-gray-400 hover:text-depor-blue shadow-sm border border-gray-100'}`}><RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} /></button>
             <div className="flex items-center gap-1 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border border-gray-100 shadow-sm">
                {syncStatus === 'synced' && <Cloud className="w-3 h-3 text-green-500" />}
                {syncStatus === 'syncing' && <CloudLightning className="w-3 h-3 text-blue-500 animate-pulse" />}
                {syncStatus === 'error' && <CloudOff className="w-3 h-3 text-red-500" />}
                {syncStatus === 'idle' && <Cloud className="w-3 h-3 text-gray-300" />}
                <span className="text-[9px] font-bold text-gray-500 uppercase">{!isCloudConfigured ? 'Local' : syncStatus === 'synced' ? 'Online' : syncStatus === 'error' ? 'Error' : 'Sync'}</span>
             </div>
        </div>
        <div className="flex justify-center mb-5 relative">
            <div className="relative z-10 p-2 bg-white rounded-full shadow-sm">
                <img src={LOGO_URL} alt="Logo" className="h-28 w-auto object-contain hover:scale-105 transition-transform duration-300 drop-shadow-sm" />
            </div>
        </div>
        <h1 className="text-3xl font-black text-depor-blue tracking-tighter uppercase leading-none">Peña Deportivista <span className="block text-4xl text-orange-brand mt-1 drop-shadow-sm">Berberecho</span></h1>
      </header>

      {/* TABS */}
      <div className="flex justify-center mb-6">
          <div className="bg-white p-1 rounded-full shadow-sm border border-gray-200 inline-flex">
              <button onClick={() => setCurrentTab('tickets')} className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'tickets' ? 'bg-depor-blue text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Ticket className="w-4 h-4" /> Abonos</button>
              <button onClick={() => setCurrentTab('raffle')} className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'raffle' ? 'bg-orange-brand text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Trophy className="w-4 h-4" /> Sorteos</button>
              <button onClick={() => setCurrentTab('history')} className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${currentTab === 'history' ? 'bg-depor-blue text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><History className="w-4 h-4" /> Historial</button>
          </div>
      </div>

      {!isCloudConfigured && (<div className="max-w-md mx-auto mb-4 bg-yellow-50 border border-yellow-200 p-3 rounded-xl flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" /><div><h4 className="text-sm font-bold text-yellow-800">Modo Local Activo</h4><p className="text-xs text-yellow-700 mt-1">Configure el script en <code>services/cloudBridge.ts</code>.</p></div></div>)}

      {currentTab === 'tickets' ? (
        <>
            <div className="max-w-md mx-auto mb-6 px-1"><button type="button" onClick={handleFullReset} disabled={loading} className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm active:scale-[0.98]"><RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Reseteando...' : 'REINICIAR TODO'}</button></div>
            <div className="max-w-md mx-auto space-y-4">
                {loading ? (<div className="text-center py-12 text-gray-500 flex items-center justify-center gap-2"><RefreshCw className="animate-spin w-4 h-4"/> Cargando...</div>) : (
                    PASS_SLOTS.map((slot) => {
                        const assignedMember = assignments[slot.slotId];
                        return (
                            <div key={slot.slotId} className="group bg-white p-3 rounded-2xl shadow-sm border border-gray-100 hover:border-depor-blue/30 transition-all flex items-center justify-between gap-3 relative overflow-hidden">
                                <div className="flex flex-col items-center justify-center bg-gray-50 w-14 h-full py-2 rounded-xl border border-gray-100 shrink-0"><span className="text-2xl font-black text-depor-blue/80 leading-none">{slot.slotId}</span><span className="text-[9px] font-bold text-gray-400 mt-1 uppercase text-center leading-tight">{slot.seatInfo}</span></div>
                                <div className="flex-1 min-w-0">{assignedMember ? (<><p className="font-bold text-gray-800 text-base truncate">{assignedMember.name}</p><div className="flex items-center gap-2 mt-1"><span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">ID: {assignedMember.id}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${assignedMember.paid.toLowerCase() === 'si' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{assignedMember.paid.toLowerCase() === 'si' ? 'ACTIVO' : 'PENDIENTE'}</span></div></>) : (<div className="flex items-center gap-2 opacity-40"><div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"><Users className="w-4 h-4 text-gray-400" /></div><span className="text-sm font-medium italic text-gray-400">Sin asignar</span></div>)}</div>
                                <div className="flex items-center gap-2 shrink-0"><button onClick={() => openAssignmentModal(slot.slotId)} className={`w-9 h-9 rounded-full border transition-all flex items-center justify-center shadow-sm ${assignedMember ? 'bg-white border-gray-200 text-gray-400 hover:text-orange-500' : 'bg-orange-50 border-orange-200 text-orange-600'}`}>{assignedMember ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}</button>{assignedMember && (<><div className="w-[1px] h-6 bg-gray-200 mx-1"></div><button onClick={() => handlePreview(slot.slotId, slot.imageUrl)} className="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-depor-blue flex items-center justify-center shadow-sm"><Eye className="w-4 h-4" /></button><button onClick={() => handleQuickShare(slot.slotId, slot.imageUrl)} className="w-9 h-9 rounded-full bg-depor-blue text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"><Share2 className="w-4 h-4" /></button></>)}</div>
                            </div>
                        );
                    })
                )}
            </div>
        </>
      ) : currentTab === 'raffle' ? (
        <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Calendar className="w-5 h-5 text-orange-brand" /> Partido</h2>
                <div className="space-y-4">
                    <input type="text" placeholder="Ej: Dépor vs Celta" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-brand/20 transition-all font-medium" value={matchName} onChange={(e) => { setMatchName(e.target.value); }} />
                    <div className="grid grid-cols-3 gap-3">
                         <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col items-center justify-center shadow-sm"><span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Total</span><span className="text-xl font-black text-gray-600 leading-none">{raffleStats.total}</span></div>
                         <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex flex-col items-center justify-center shadow-sm"><span className="text-[10px] text-green-600/70 font-bold uppercase tracking-wider mb-0.5">Activos</span><span className="text-xl font-black text-green-600 leading-none">{raffleStats.active}</span></div>
                         <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex flex-col items-center justify-center shadow-sm"><span className="text-[10px] text-orange-600/70 font-bold uppercase tracking-wider mb-0.5">Pendientes</span><span className="text-xl font-black text-orange-600 leading-none">{raffleStats.pending}</span></div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Trophy className="w-5 h-5 text-orange-brand" /> Sorteo Abonos</h2>
                {raffleWinners.length === 0 ? (
                    <button onClick={runMainRaffle} disabled={loading} className="w-full bg-orange-brand text-white font-bold py-4 rounded-xl shadow-lg hover:bg-orange-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"><Shuffle className="w-5 h-5" /> REALIZAR SORTEO (10)</button>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2">
                            {/* WRAPPER PRINCIPAL QUE MANEJA EL CLIC */}
                            <div className="flex-1 relative cursor-pointer group" onClick={handleCopyRaffleImage}>
                                {/* ESTE ES EL ELEMENTO QUE CAPTURA LA LIBRERÍA */}
                                <div id="raffle-card" className="relative rounded-2xl overflow-hidden shadow-lg border border-gray-200 hover:shadow-xl transition-all">
                                    <div className="absolute inset-0 z-0">
                                        <img src={`https://wsrv.nl/?url=${encodeURIComponent(RAFFLE_BG_URL)}&output=png`} crossOrigin="anonymous" alt="Fondo" className="w-full h-full object-cover object-top opacity-100" />
                                        <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[1px]"></div>
                                    </div>
                                    <div className="relative z-10 flex flex-col p-2 gap-1.5">
                                        <div className="bg-white/40 backdrop-blur-md px-3 py-2 rounded-xl shadow-sm border border-white/30 flex items-center justify-center mb-1 h-10"><h3 className="text-[10px] sm:text-xs font-black text-depor-blue uppercase tracking-wider text-center">🏆 PREMIADOS - {matchName}</h3></div>
                                        {raffleWinners.map((w, i) => (
                                            <div key={w.id} className="bg-white/20 backdrop-blur-md px-3 py-0 rounded-xl shadow-sm border border-white/20 flex items-center justify-between min-w-0 h-12 transition-colors hover:bg-white/40">
                                                <div className="flex items-center gap-2 min-w-0 mr-1 overflow-hidden"><span className="font-mono font-bold text-gray-800 text-xs w-4 shrink-0">{i+1}.</span><span className={`font-bold text-xs truncate text-gray-900 ${winnersStatus[w.id] === 'rejected' ? 'text-gray-500 line-through decoration-2 opacity-60' : ''}`}>{w.name}</span></div>
                                                <span className="text-[9px] bg-depor-blue text-white px-1.5 py-0.5 rounded font-bold font-mono min-w-[28px] text-center shadow-sm shrink-0">{w.id}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5 pt-2">
                                <div className="h-10 mb-1"></div>
                                {raffleWinners.map((w) => (
                                    <div key={w.id} className="flex items-center bg-white border border-gray-100 rounded-xl p-1 shadow-sm h-12">
                                        <button onClick={() => updateWinnerStatus(w.id, 'confirmed')} className={`w-8 h-full rounded-lg flex items-center justify-center transition-all ${winnersStatus[w.id] === 'confirmed' ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-green-500'}`}><Check className="w-4 h-4" /></button>
                                        <button onClick={() => updateWinnerStatus(w.id, 'rejected')} className={`w-8 h-full rounded-lg flex items-center justify-center transition-all ${winnersStatus[w.id] === 'rejected' ? 'bg-red-500 text-white' : 'text-gray-300 hover:text-red-500'}`}><X className="w-4 h-4" /></button>
                                        <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>
                                        <a href={getRaffleWinnerMessage(w, matchName)} target="_blank" rel="noreferrer" className="w-8 h-full rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50"><MessageCircle className="w-4 h-4" /></a>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { if(window.confirm("¿Repetir sorteo? Se perderán los resultados.")) { setRaffleWinners([]); persistState({ activeRaffle: null }); } }} className="flex-1 py-3 text-gray-500 font-bold text-xs hover:bg-gray-50 rounded-xl border border-gray-200"><RotateCcw className="w-3 h-3 inline mr-1" /> Repetir</button>
                            <button onClick={transferWinnersToSlots} className="flex-[2] py-3 bg-depor-blue text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"><ArrowRightCircle className="w-4 h-4" /> Asignar</button>
                             <button type="button" onClick={handleCloseMatchday} className="w-12 py-3 bg-gray-800 text-white rounded-xl hover:bg-black shadow-md flex items-center justify-center" title="Guardar y Cerrar Jornada"><Save className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-gray-500" /> Reservas</h2><button onClick={() => { setSearchTerm(''); setShowReserveSearch(true); }} className="bg-gray-100 text-gray-600 p-2 rounded-full hover:bg-gray-200"><UserPlus className="w-4 h-4" /></button></div>
                <ul className="space-y-2 mb-4">
                    {reserveList.map(r => (
                        <li key={r.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                            <div className="flex items-center gap-2 min-w-0"><span className="bg-gray-200 text-gray-600 text-xs font-mono px-1.5 py-0.5 rounded shrink-0">{r.id}</span><span className="text-sm font-medium text-gray-700 truncate">{r.name}</span></div>
                            <button onClick={() => removeReserve(r.id)} className="text-red-400 hover:text-red-600 shrink-0 ml-2"><XCircle className="w-4 h-4"/></button>
                        </li>
                    ))}
                </ul>
                {showReserveSearch && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-4 shadow-xl">
                            <div className="flex justify-between mb-2"><h3 className="font-bold">Añadir Reserva</h3><button onClick={() => setShowReserveSearch(false)}><XCircle className="w-5 h-5 text-gray-400"/></button></div>
                            <input type="text" placeholder="Buscar socio..." className="w-full p-2 border rounded-lg mb-2" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {allMembers.filter(m => (m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.includes(searchTerm)) && !reserveList.find(r => r.id === m.id)).slice(0, 50).map(m => {
                                    const isPaid = m.paid.toUpperCase().includes('S') || m.paid.toUpperCase() === 'OK';
                                    return (
                                        <button key={m.id} onClick={() => handleAddReserve(m)} className="w-full text-left p-2 hover:bg-gray-50 text-sm border-b border-gray-100 flex items-center justify-between group">
                                            <div className="flex items-center gap-2 min-w-0"><span className="bg-gray-100 text-gray-500 text-xs font-mono px-1.5 py-0.5 rounded min-w-[28px] text-center">{m.id}</span><span className={`truncate ${!isPaid ? 'text-gray-400' : 'text-gray-700'}`}>{m.name}</span></div>
                                            <div className="pl-2">{isPaid ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {reserveList.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 mb-3"><span className="text-xs font-bold text-gray-500 uppercase">Huecos:</span><input type="number" min="0" max="10" value={reserveSpotsNeeded} readOnly className="w-16 p-1 text-center border rounded bg-gray-100 text-gray-500 text-sm font-bold cursor-not-allowed" /></div>
                        <button onClick={runReserveRaffle} className="w-full py-2 bg-gray-800 text-white text-sm font-bold rounded-xl hover:bg-black transition-all flex justify-center gap-2"><Shuffle className="w-4 h-4" /> Sortear Reservas</button>
                        {reserveWinners.length > 0 && (<div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-3"><h4 className="text-xs font-bold text-green-800 mb-2 uppercase text-center">🎉 RESERVAS PREMIADOS - {matchName}</h4><ul className="text-sm space-y-1">{reserveWinners.map(w => (<li key={w.id} className="text-green-900 font-medium flex items-center gap-2"><CheckCircle className="w-3 h-3 shrink-0" /><span className="font-mono font-bold text-xs bg-white border border-green-200 text-green-700 px-1 py-0.5 rounded w-9 text-center shrink-0 shadow-sm">{w.id}</span><span className="truncate">{w.name}</span></li>))}</ul></div>)}
                    </div>
                )}
            </div>
        </div>
      ) : (
        <div className="max-w-md mx-auto space-y-6 animate-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2 px-1"><Archive className="w-5 h-5 text-gray-500" /> Historial de Jornadas</h2>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative">
                <input type="text" placeholder="Buscar socio en el historial..." className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-depor-blue/20" value={historySearchTerm} onChange={(e) => { setHistorySearchTerm(e.target.value); setSelectedHistoryMember(null); }} />
                <Search className="absolute left-7 top-7 text-gray-400 w-5 h-5" />
                {historySearchTerm && !selectedHistoryMember && (
                    <div className="mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-lg absolute w-[calc(100%-2rem)] z-20">
                         {filteredMembersForHistory.map(m => (<button key={m.id} onClick={() => { setSelectedHistoryMember(m); setHistorySearchTerm(''); }} className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b flex items-center justify-between"><span className="text-sm font-medium text-gray-700 truncate">{m.name}</span><span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-500">ID: {m.id}</span></button>))}
                    </div>
                )}
            </div>
            {availableSeasons.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                    <button onClick={() => setSelectedSeasonFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${selectedSeasonFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'}`}>Todo</button>
                    {availableSeasons.map(season => (<button key={season} onClick={() => setSelectedSeasonFilter(season)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${selectedSeasonFilter === season ? 'bg-orange-brand text-white border-orange-brand' : 'bg-white text-gray-500 border-gray-200'}`}>Temp. {season}</button>))}
                </div>
            )}
            {selectedHistoryMember && (() => {
                const stats = getMemberHistory(selectedHistoryMember.id);
                return (
                    <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-full bg-depor-blue text-white flex items-center justify-center font-bold text-lg"><User className="w-6 h-6" /></div><div><h3 className="font-bold text-gray-900 leading-tight">{selectedHistoryMember.name}</h3><p className="text-xs text-gray-500 font-mono mt-0.5">ID: {selectedHistoryMember.id}</p></div></div><button onClick={() => setSelectedHistoryMember(null)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5"/></button></div>
                        <div className="grid grid-cols-2 gap-3 mb-4"><div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Ganador</p><p className="text-2xl font-black text-depor-blue">{stats.wins.length + stats.importedWins.length}</p></div><div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Reserva</p><p className="text-2xl font-black text-gray-500">{stats.reserves.length}</p></div></div>
                        <div className="space-y-2">{stats.wins.map((r: MatchHistoryRecord) => <span key={r.id} className="inline-block mr-2 mb-2 text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded-md font-bold border border-green-200">{r.matchName}</span>)}{stats.importedWins.map((w, i) => <span key={i} className="inline-block mr-2 mb-2 text-[10px] bg-purple-100 text-purple-800 px-2 py-1 rounded-md font-bold border border-purple-200">{w}</span>)}</div>
                    </div>
                );
            })()}
            {filteredHistory.map((record) => (
                <div key={record.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                    <div className="bg-gray-50 p-4 border-b border-gray-100">
                        <div className="flex justify-between items-start mb-1">
                             <div className="flex-1">
                                 {record.isCycleReset && (<div className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 border border-yellow-200 shadow-sm"><RefreshCcw className="w-3 h-3" /><span>CICLO REINICIADO</span></div>)}
                                 <h3 className="font-black text-gray-800 text-lg leading-tight uppercase">{record.matchName}</h3>
                                 <div className="flex items-center gap-3 mt-1"><p className="text-xs text-gray-500 flex items-center gap-1 font-medium"><Calendar className="w-3 h-3 text-gray-400"/> {new Date(record.date).toLocaleDateString()}</p><p className="text-xs text-gray-400 flex items-center gap-1 font-medium bg-gray-100 px-1.5 py-0.5 rounded">Temp. {record.season || 'Anterior'}</p></div>
                             </div>
                             <span className="text-xs bg-depor-blue text-white px-2.5 py-1 rounded-lg font-bold shadow-sm">{record.winners.length} Premiados</span>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {record.winners.map((w, i) => (<div key={w.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-2 shadow-sm hover:border-depor-blue/30 transition-colors"><div className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs shadow-sm border border-orange-100 shrink-0">{i+1}</div><div className="min-w-0"><p className="font-bold text-gray-800 text-sm truncate">{w.name}</p><p className="text-[10px] text-gray-400 font-mono">ID: {w.id}</p></div></div>))}
                        </div>
                    </div>
                    {/* Visualización de Reservas en Historial */}
                    {record.reserves && record.reserves.length > 0 && (<div className="bg-gray-50 border-t border-gray-100 px-4 py-3"><h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1 opacity-70"><ClipboardList className="w-3 h-3" /> Reservas / Lista de Espera</h4><div className="flex flex-wrap gap-2">{record.reserves.map((r) => (<div key={r.id} className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded text-[10px] text-gray-500"><div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div><span className="font-medium truncate max-w-[120px]">{r.name}</span></div>))}</div></div>)}
                </div>
            ))}
            {filteredHistory.length === 0 && (<div className="text-center py-10 opacity-50"><History className="w-12 h-12 mx-auto text-gray-300 mb-2" /><p className="text-gray-400 font-medium text-sm">No hay partidos en esta temporada.</p></div>)}
        </div>
      )}

      {assignmentModalOpen && (
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex flex-col items-center justify-start sm:justify-center p-4 pt-20">
              <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between mb-6"><div><h3 className="text-xl font-bold text-gray-900">Asignar Abono #{currentSlotId}</h3></div><button onClick={() => setAssignmentModalOpen(false)}><XCircle className="w-6 h-6 text-gray-400" /></button></div>
                  <input type="text" placeholder="Buscar socio..." autoFocus className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl mb-4" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <div className="flex-1 overflow-y-auto space-y-2">
                      {assignments[currentSlotId!] && <button onClick={handleUnassignMember} className="w-full p-3 rounded-xl border border-red-100 bg-red-50 text-red-600 font-medium flex items-center justify-center gap-2 mb-4"><XCircle className="w-4 h-4" /> Dejar vacío</button>}
                      {filteredMembersForAssignment.slice(0, 20).map(member => {
                          const isAssigned = (Object.values(assignments) as Member[]).some(m => m.id === member.id && assignments[currentSlotId!]?.id !== member.id);
                          const isPaid = member.paid === 'SI';
                          
                          return (
                            <button 
                                key={member.id} 
                                onClick={() => !isAssigned && handleAssignMember(member)} 
                                disabled={isAssigned} 
                                className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${isAssigned ? 'opacity-50 bg-gray-50 cursor-not-allowed' : 'bg-white hover:bg-blue-50 hover:border-blue-100 border-gray-100'}`}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {/* ICONO DE ESTADO SOLICITADO */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPaid ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                        {isPaid ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-gray-900 truncate">{member.name}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1 rounded">ID: {member.id}</span>
                                            <span className={`text-[10px] font-bold px-1.5 rounded ${isPaid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                {isPaid ? 'ACTIVO' : 'PENDIENTE'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {isAssigned && <span className="text-[10px] font-bold bg-gray-200 text-gray-500 px-2 py-1 rounded shrink-0">OCUPADO</span>}
                            </button>
                          );
                      })}
                  </div>
              </div>
          </div>
      )}
      
      {(quickShareData || selectedPreviewData) && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
             <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative">
                <button onClick={() => {closeQuickShare(); closePreview();}} className="absolute right-4 top-4 text-gray-400"><XCircle className="w-6 h-6" /></button>
                <div id={`popup-card`} className="mb-4 flex justify-center">
                    <CardCanvas 
                        memberId={(quickShareData || selectedPreviewData)!.member.id} 
                        memberName={(quickShareData || selectedPreviewData)!.member.name} 
                        imageUrl={(quickShareData || selectedPreviewData)!.imageUrl} 
                        referenceTimestamp={lastResetTime} 
                        seatInfo={`Asiento ${(quickShareData || selectedPreviewData)!.slotId}`} // <-- INTEGRACIÓN CRÍTICA DEL MODO FAIL-SAFE
                    />
                </div>
                {quickShareData && (<div className="grid grid-cols-2 gap-3"><a href={getWhatsAppMessage(quickShareData.member, generateLinkForMember(quickShareData.member, lastResetTime, quickShareData.slotId))} target="_blank" rel="noreferrer" className="bg-[#25D366] text-white font-bold py-3 px-4 rounded-xl text-center text-sm flex items-center justify-center gap-2 hover:bg-[#20bd5a] transition-all"><Send className="w-4 h-4" /> WhatsApp</a><button onClick={() => handleCopyLink(quickShareData.member, quickShareData.slotId)} className="bg-blue-50 text-depor-blue border border-blue-100 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"><Link className="w-4 h-4" /> Copiar Enlace</button></div>)}
             </div>
        </div>
      )}
    </div>
  );
};

// --- SecureViewer (Standalone) ---
const SecureViewer: React.FC = () => {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [referenceTimestamp, setReferenceTimestamp] = useState<number | undefined>(undefined);
  const [forcedImageUrl, setForcedImageUrl] = useState<string | undefined>(undefined);
  const [seatInfo, setSeatInfo] = useState<string>(''); // Nuevo estado para datos de asiento
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
        const hash = window.location.hash;
        const queryString = hash.split('?')[1];
        const urlParams = new URLSearchParams(queryString);
        
        const id = urlParams.get('id');
        const timestampStr = urlParams.get('t'); 
        const slotIdStr = urlParams.get('slot');

        if (!id) { setError('Enlace inválido.'); setLoading(false); return; }
        
        // Validación de expiración
        if (timestampStr) { 
            const timestamp = parseInt(timestampStr); 
            setReferenceTimestamp(timestamp); 
            if (Date.now() > timestamp + (96 * 60 * 60 * 1000)) { 
                setIsExpired(true); setLoading(false); return; 
            } 
        }

        // Carga de configuración del Slot
        if (slotIdStr) { 
            const slotConfig = PASS_SLOTS.find(s => s.slotId === parseInt(slotIdStr)); 
            if (slotConfig) {
                setForcedImageUrl(slotConfig.imageUrl);
                setSeatInfo(slotConfig.seatInfo); // <-- CARGA DE DATOS DE ASIENTO
            }
        }

        try { 
            const members = await fetchMembers(); 
            const found = members.find(m => m.id === id); 
            if (found) setMember(found); 
            else setError('Socio no encontrado.'); 
        } catch (e) { 
            setError('Error de conexión.'); 
        } finally { 
            setLoading(false); 
        }
    };
    fetchData();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white flex-col"><Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500"/><p>Verificando credenciales...</p></div>;
  if (isExpired) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white text-center p-4"><AlertTriangle className="w-16 h-16 text-red-500 mb-4"/><h1>Enlace Caducado</h1><p className="text-gray-400 mt-2">Solicite un nuevo enlace al administrador.</p></div>;
  if (error || !member) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-bold">{error}</div>;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center secure-view p-4">
        <CardCanvas 
            memberId={member.id} 
            memberName={member.name} 
            imageUrl={forcedImageUrl || member.imageUrl} 
            referenceTimestamp={referenceTimestamp}
            seatInfo={seatInfo} // <-- PASE DE PROPS PARA FAIL-SAFE
        />
    </div>
  );
};

const App: React.FC = () => {
  const [route, setRoute] = useState<'dashboard' | 'view'>('dashboard');
  useEffect(() => { const handleRoute = () => setRoute(window.location.hash.includes('/view') ? 'view' : 'dashboard'); handleRoute(); window.addEventListener('hashchange', handleRoute); return () => window.removeEventListener('hashchange', handleRoute); }, []);
  return <>{route === 'dashboard' ? <Dashboard /> : <SecureViewer />}</>;
};

export default App;
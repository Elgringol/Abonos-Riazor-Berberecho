import React, { useState, useEffect } from 'react';
import { toPng } from 'html-to-image';
import { fetchMembers, DEFAULT_IMAGES } from './services/googleSheet';
import { Member } from './types';
import { generateWhatsAppLink } from './utils';
import CardCanvas from './components/CardCanvas';
import { Search, Share2, CheckCircle, RefreshCw, XCircle, Copy, Eye, Image as ImageIcon, Send, Download, Globe, Wifi, Pencil, UserPlus, Users, RotateCcw, AlertTriangle } from 'lucide-react';

// --- Constantes Visuales ---
const LOGO_ID = "10m8lfNupdyr8st5zXKE5xobx-NsciILT";
// CORRECCIÓN: Usamos Thumbnail API directa para el logo principal para máxima velocidad
const LOGO_URL = `https://drive.google.com/thumbnail?id=${LOGO_ID}&sz=w800`;

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


// --- Sub-Component: Dashboard (Admin View) ---
const Dashboard: React.FC = () => {
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);
  
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

  useEffect(() => {
    loadData();
    setIsLocalhost(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    // Cargar asignaciones guardadas
    const saved = localStorage.getItem('slot_assignments');
    if (saved) {
        try {
            setAssignments(JSON.parse(saved));
        } catch (e) {}
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchMembers();
    setAllMembers(data);
    setLoading(false);
  };

  // --- FUNCIÓN DE RESET COMPLETO ---
  const handleFullReset = async () => {
      const confirmMsg = "⚠️ ¿RESET COMPLETO?\n\nEsta acción:\n1. Borrará todos los socios asignados de los 10 abonos.\n2. Actualizará los datos desde el Excel.\n3. Reiniciará el plazo de 4 días de caducidad.\n\n¿Deseas continuar?";
      
      if (!window.confirm(confirmMsg)) return;

      setLoading(true);
      
      // 1. Limpiar Asignaciones PRIMERO (Visualmente instantáneo)
      // Lo hacemos antes del try para asegurar que la UI se limpia aunque falle la red
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
      <header className="-mx-4 -mt-4 mb-8 text-center pt-10 pb-8 bg-white rounded-b-[2.5rem] shadow-sm border-b border-gray-100 relative overflow-hidden">
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
        <div className="mt-4 flex justify-center">
            {isLocalhost ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-[10px] font-bold border border-orange-100"><Wifi className="w-3 h-3" /> Local</span>
            ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold border border-green-100"><Globe className="w-3 h-3" /> Online</span>
            )}
        </div>
      </header>

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
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Pulsar para borrar asignaciones y reiniciar caducidad (96h)
          </p>
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
                        
                        {/* 1. SECCIÓN IZQUIERDA: NUMERACIÓN Y ASIENTO */}
                        <div className="flex flex-col items-center justify-center bg-gray-50 w-14 h-full py-2 rounded-xl border border-gray-100 shrink-0">
                            <span className="text-2xl font-black text-depor-blue/80 leading-none">{slot.slotId}</span>
                            <span className="text-[9px] font-bold text-gray-400 mt-1 uppercase text-center leading-tight">
                                {slot.seatInfo}
                            </span>
                        </div>

                        {/* 2. SECCIÓN CENTRAL: SOCIO ASIGNADO */}
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

                        {/* 3. SECCIÓN DERECHA: ACCIONES */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Editar Asignación */}
                            <button
                                onClick={() => openAssignmentModal(slot.slotId)}
                                className={`w-9 h-9 rounded-full border transition-all flex items-center justify-center shadow-sm ${assignedMember ? 'bg-white border-gray-200 text-gray-400 hover:text-orange-500 hover:border-orange-200' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'}`}
                                title={assignedMember ? "Cambiar Socio" : "Asignar Socio"}
                            >
                                {assignedMember ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                            </button>

                            {/* Acciones solo si hay socio asignado */}
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

      {/* --- MODAL DE ASIGNACIÓN (BUSCADOR) --- */}
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
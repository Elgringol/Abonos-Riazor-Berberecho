import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Loader2, Clock, WifiOff, RefreshCw } from 'lucide-react';

interface CardCanvasProps {
  memberId: string;
  memberName: string;
  imageUrl?: string;
  referenceTimestamp?: number;
  seatInfo?: string; // Mantenemos la prop por compatibilidad, aunque no se renderice visualmente
}

const CardCanvas: React.FC<CardCanvasProps> = ({ memberId, memberName, imageUrl, referenceTimestamp }) => {
  // Estados de carga: 'idle' | 'loading' | 'success' | 'error'
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  // --- LOGO PEÑA (Marca de Agua) ---
  const PENA_LOGO_ID = "17pNVMd42F6pDU7LOCPjPZ-xrUckcYNMe";
  // Usamos CDN rápido para la marca de agua también para evitar cuellos de botella
  const WM_SRC = `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/thumbnail?id=${PENA_LOGO_ID}&sz=w600`)}&output=png&il`;

  // --- FECHA CADUCIDAD ---
  const expirationString = useMemo(() => {
    const date = referenceTimestamp ? new Date(referenceTimestamp) : new Date();
    date.setHours(date.getHours() + 96); // 4 días de validez
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  }, [referenceTimestamp]);

  // --- ESTRATEGIA DE URLS REDUNDANTES ("HYDRA") ---
  // Generamos 3 rutas de acceso diferentes para la misma imagen.
  const sourceUrls = useMemo(() => {
    if (!imageUrl) return [];

    // Extraer ID de Drive si es posible
    const driveIdMatch = imageUrl.match(/\/d\/([^/]+)|id=([^&]+)/);
    const driveId = driveIdMatch ? (driveIdMatch[1] || driveIdMatch[2]) : null;

    // URL Limpia para los proxies (quitando parámetros extra si los hubiera)
    const cleanUrl = imageUrl.split('&')[0]; 
    
    // Si no es drive, estrategia estándar
    if (!driveId) {
        return [
            `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=800&output=jpg&q=85&il`, // CDN 1
            `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&w=800&output=jpg&q=85`, // CDN 2
            imageUrl // Directo
        ];
    }

    // URL Directa de Thumbnail de Google (fuente original)
    // Pedimos w1200 para asegurar MÁXIMA calidad para el código de barras en la fuente original
    const googleThumbUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`; 

    return [
        // 1. PRIORIDAD: wsrv.nl (Cloudflare Edge Cache). 
        // Absorbe el tráfico masivo. Si 10 entran, 9 tiran de caché.
        `https://wsrv.nl/?url=${encodeURIComponent(googleThumbUrl)}&w=800&output=jpg&q=90&il&n=-1`,
        
        // 2. RESPALDO: weserv.nl (Otro servicio de caché independiente)
        // Por si wsrv.nl se cae o bloquea.
        `https://images.weserv.nl/?url=${encodeURIComponent(googleThumbUrl)}&w=800&output=jpg&q=90`,
        
        // 3. EMERGENCIA: Directo a Google
        // Solo llegamos aquí si los dos CDNs fallan o Google bloquea a los proxys.
        googleThumbUrl
    ];
  }, [imageUrl]);

  const currentSrc = sourceUrls[currentSourceIndex];

  // Reiniciar estados si cambia la imagen prop
  useEffect(() => {
    if (imageUrl) {
        setLoadStatus('loading');
        setCurrentSourceIndex(0);
    } else {
        setLoadStatus('error');
    }
  }, [imageUrl, retryCount]); // retryCount permite forzar re-render

  const handleImageError = () => {
    console.warn(`Fallo cargando fuente ${currentSourceIndex}: ${currentSrc}`);
    
    if (currentSourceIndex < sourceUrls.length - 1) {
        // Intentar siguiente fuente inmediatamente (Estrategia Hydra)
        setCurrentSourceIndex(prev => prev + 1);
    } else {
        // Se acabaron las fuentes
        setLoadStatus('error');
    }
  };

  const handleImageLoad = () => {
      setLoadStatus('success');
  };

  const handleManualRetry = useCallback(() => {
      setLoadStatus('loading');
      setCurrentSourceIndex(0);
      setRetryCount(prev => prev + 1); // Forzar efecto
  }, []);

  return (
    <div id={`card-${memberId}`} className="relative w-full max-w-[340px] mx-auto bg-white select-none">
      
      {/* CONTENEDOR PRINCIPAL */}
      <div className="relative overflow-hidden rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white flex flex-col min-h-[480px]">
        
        {/* ZONA DE IMAGEN */}
        <div className="relative w-full h-full bg-gray-900 flex-1 min-h-[480px] flex items-center justify-center">
            
            {/* SPINNER DE CARGA */}
            {loadStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-20">
                    <Loader2 className="w-10 h-10 animate-spin text-depor-blue mb-3" />
                    <p className="text-xs font-bold text-gray-500 animate-pulse">
                        {currentSourceIndex === 0 ? "Cargando pase seguro..." : "Conectando servidor de respaldo..."}
                    </p>
                </div>
            )}

            {/* IMAGEN DEL ABONO (El núcleo del acceso) */}
            {currentSrc && loadStatus !== 'error' && (
                <img 
                    src={currentSrc}
                    alt="Abono Digital"
                    crossOrigin="anonymous"
                    loading="eager" // Prioridad máxima
                    // --- MODO ESCÁNER ---
                    // contrast-125: Aumenta la diferencia entre blancos y negros (Barcode Friendly)
                    // brightness-110: Compensa pantallas oscuras
                    // mix-blend-normal: Asegura renderizado estándar
                    className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 contrast-125 brightness-110 ${loadStatus === 'success' ? 'opacity-100' : 'opacity-0'}`}
                    style={{ imageRendering: 'auto' }} // Permitimos suavizado para textos, pero el contraste alto ayuda al código de barras
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            )}

            {/* PANTALLA DE ERROR FINAL (Si fallan las 3 vías) */}
            {loadStatus === 'error' && (
                <div className="absolute inset-0 z-30 bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
                    <WifiOff className="w-16 h-16 text-red-500 mb-4" />
                    <h3 className="text-white font-bold text-xl mb-2">Error de Carga</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        No se ha podido recuperar el código de acceso.
                    </p>
                    <button 
                        onClick={handleManualRetry}
                        className="bg-white text-gray-900 font-bold py-3 px-6 rounded-xl flex items-center gap-2 hover:bg-gray-100 transition-all active:scale-95 shadow-lg"
                    >
                        <RefreshCw className="w-5 h-5" /> REINTENTAR AHORA
                    </button>
                    {/* ELIMINADO: Bloque visual de Fail-Safe (Fila/Asiento). El código de barras es mandatorio. */}
                </div>
            )}

            {/* 2. SUPERPOSICIÓN DE DATOS (Overlay) */}
            {/* Se muestra siempre sobre la imagen para validar identidad visualmente */}
            <div className="absolute top-0 left-0 w-full pt-6 pb-12 px-5 bg-gradient-to-b from-black/80 via-black/20 to-transparent z-10 pointer-events-none">
                 <div className="flex flex-col items-start w-full drop-shadow-md">
                    <h2 className="text-2xl font-black text-white leading-tight uppercase tracking-tight" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        {memberName}
                    </h2>
                    <div className="mt-2 w-full flex items-center justify-between">
                        <span className="bg-white/20 backdrop-blur-md text-white text-[11px] font-bold px-2 py-0.5 rounded border border-white/30 shadow-sm">
                            ID: {memberId}
                        </span>
                        <span className="flex items-center gap-1 bg-orange-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/20 shadow-sm">
                            <Clock className="w-3 h-3" />
                            CADUCA: {expirationString}
                        </span>
                    </div>
                 </div>
            </div>

            {/* 3. MARCA DE AGUA (Solo visible si carga ok) */}
            {loadStatus === 'success' && (
                <div className="absolute top-[20%] left-0 w-full h-[30%] flex items-center justify-center pointer-events-none z-10 overflow-hidden mix-blend-soft-light opacity-50">
                    <img 
                        src={WM_SRC} 
                        alt="" 
                        crossOrigin="anonymous"
                        className="w-[40%] grayscale"
                    />
                </div>
            )}
            
            {/* EFECTO DE ESCÁNER (Línea de luz que recorre el abono) */}
            {/* Da feedback visual de que la app está "viva" y no es una captura de pantalla */}
            <div className="absolute top-0 w-full h-[2px] bg-white/50 shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-[scan_3s_linear_infinite] pointer-events-none z-10"></div>
        </div>
        
        {/* Hologram Overlay (Estética de seguridad) */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-20 pointer-events-none z-20" style={{ mixBlendMode: 'overlay' }}></div>
      </div>
      
      <p className="text-center text-[10px] text-gray-400 mt-4 font-medium uppercase tracking-widest">
        Aumente el brillo de la pantalla al máximo
      </p>
    </div>
  );
};

export default CardCanvas;
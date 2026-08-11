import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Loader2, Clock, WifiOff, RefreshCw } from 'lucide-react';

interface CardCanvasProps {
  memberId: string;
  memberName: string;
  imageUrl?: string;
  referenceTimestamp?: number;
  seatInfo?: string;
}

const CardCanvas: React.FC<CardCanvasProps> = ({ memberId, memberName, imageUrl, referenceTimestamp }) => {
  // --- MARCA DE AGUA SEGURIDAD (Logo Peña) ---
  const PENA_LOGO_ID = "17pNVMd42F6pDU7LOCPjPZ-xrUckcYNMe";
  const WM_SRC = `https://lh3.googleusercontent.com/d/${PENA_LOGO_ID}=s800`;

  // Estados de carga: 'idle' | 'loading' | 'success' | 'error'
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

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
    <div id={`card-${memberId}`} className="relative w-full max-w-[420px] mx-auto select-none">
      
      {/* CONTENEDOR PRINCIPAL - Imagen expandida con overlays de información */}
      <div className="relative overflow-hidden rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-[#f08e5c] border border-gray-800/20">
        
        {/* ZONA DE IMAGEN DEL ABONO (Aprovecha el espacio completo) */}
        <div className="relative w-full bg-[#f08e5c] flex items-center justify-center overflow-hidden min-h-[380px]">
            
            {/* SPINNER DE CARGA */}
            {loadStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-20">
                    <Loader2 className="w-10 h-10 animate-spin text-depor-blue mb-3" />
                    <p className="text-xs font-bold text-gray-400 animate-pulse">
                        {currentSourceIndex === 0 ? "Cargando pase seguro..." : "Conectando servidor de respaldo..."}
                    </p>
                </div>
            )}

            {/* IMAGEN DEL ABONO (Ocupa el máximo espacio vertical/horizontal) */}
            {currentSrc && loadStatus !== 'error' && (
                <img 
                    src={currentSrc}
                    alt="Abono Digital"
                    crossOrigin="anonymous"
                    loading="eager"
                    // --- MODO OPTIMIZADO PARA TORNO ---
                    // w-full object-contain: Expande el abono al máximo ancho de la pantalla sin deformarlo
                    // contrast-[1.25] brightness-[1.05]: Maximiza contraste para escáneres
                    className={`w-full h-auto max-h-[85vh] object-contain transition-opacity duration-300 contrast-[1.25] brightness-[1.05] ${loadStatus === 'success' ? 'opacity-100' : 'opacity-0'}`}
                    style={{ imageRendering: 'auto' }}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            )}

            {/* FECHA DE CADUCIDAD (SUPERPUESTA EN LA PARTE SUPERIOR DERECHA) */}
            {loadStatus === 'success' && (
                <div className="absolute top-3 right-3 z-20 pointer-events-none">
                    <span className="flex items-center gap-1.5 bg-gray-950/85 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full border border-white/20 shadow-lg">
                        <Clock className="w-3.5 h-3.5 text-orange-400" />
                        <span>CADUCA: <strong className="text-orange-400">{expirationString}</strong></span>
                    </span>
                </div>
            )}

            {/* MARCA DE AGUA DE SEGURIDAD (Centrada sobre la zona de grada/fila/asiento del abono, justo antes del marco negro) */}
            {loadStatus === 'success' && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center justify-center opacity-20 mix-blend-multiply drop-shadow-sm max-w-[85%]">
                    <img 
                        src={WM_SRC} 
                        alt="" 
                        crossOrigin="anonymous" 
                        className="h-[240px] max-h-[50vh] w-auto object-contain filter contrast-125 brightness-110"
                    />
                </div>
            )}

            {/* MARCO NEGRO SUPERPUESTO EN LA PARTE INFERIOR (NOMBRE E ID DE SOCIO) */}
            {loadStatus === 'success' && (
                <div className="absolute bottom-0 inset-x-0 bg-gray-950/90 backdrop-blur-md text-white px-4 py-2.5 flex items-center justify-between border-t border-gray-800/80 z-20 pointer-events-none">
                    <div className="min-w-0 pr-3">
                        <h2 className="text-xs sm:text-sm font-black uppercase tracking-tight text-white leading-tight truncate">
                            {memberName}
                        </h2>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-[11px] text-gray-300 font-mono">
                            ID SOCIO: <span className="text-white font-bold">{memberId}</span>
                        </p>
                    </div>
                </div>
            )}

            {/* PANTALLA DE ERROR FINAL */}
            {loadStatus === 'error' && (
                <div className="absolute inset-0 z-30 bg-gray-900 flex flex-col items-center justify-center p-6 text-center min-h-[380px]">
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
                </div>
            )}

            {/* EFECTO DE ESCÁNER LIGERO */}
            <div className="absolute top-0 w-full h-[2px] bg-blue-400/40 shadow-[0_0_10px_rgba(96,165,250,0.8)] animate-[scan_3s_linear_infinite] pointer-events-none z-10 opacity-70"></div>
        </div>
      </div>
      
      <p className="text-center text-[10px] text-gray-400 mt-2.5 font-medium uppercase tracking-widest">
        Aumente el brillo de la pantalla al máximo
      </p>
    </div>
  );
};

export default CardCanvas;
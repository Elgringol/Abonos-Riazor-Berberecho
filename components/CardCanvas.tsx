import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Clock } from 'lucide-react';

interface CardCanvasProps {
  memberId: string;
  memberName: string;
  imageUrl?: string;
  referenceTimestamp?: number; // Optional: If provided, expiration is calculated from this time
}

const CardCanvas: React.FC<CardCanvasProps> = ({ memberId, memberName, imageUrl, referenceTimestamp }) => {
  const [imageState, setImageState] = useState<'loading' | 'success' | 'error'>('loading');
  const [currentCandidateIndex, setCurrentCandidateIndex] = useState(0);

  // Logo de la Peña para MARCA DE AGUA (Usamos el logo anterior que integra mejor sin fondo)
  // ID Anterior: 17pNVMd42F6pDU7LOCPjPZ-xrUckcYNMe
  const PENA_LOGO_ID = "17pNVMd42F6pDU7LOCPjPZ-xrUckcYNMe";
  const penaLogoUrl = `https://wsrv.nl/?url=https://drive.google.com/uc?id=${PENA_LOGO_ID}&w=400&output=png`;

  // ---------------------------------------------------------
  // EXPIRATION DATE LOGIC (Security Feature)
  // ---------------------------------------------------------
  const expirationString = useMemo(() => {
    // If a reference timestamp is provided (from the "Reset" button), use it.
    // Otherwise, fallback to current time (dynamic).
    const date = referenceTimestamp ? new Date(referenceTimestamp) : new Date();
    
    // Add 96 hours (4 days)
    date.setHours(date.getHours() + 96);
    
    // Format: DD/MM (Sin hora)
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    return `${day}/${month}`;
  }, [referenceTimestamp]);

  // ---------------------------------------------------------
  // ROBUST IMAGE STRATEGY: CASCADE LOADING
  // ---------------------------------------------------------
  const imageCandidates = useMemo(() => {
    if (!imageUrl) return [];

    // Extract Drive ID if present
    const driveIdMatch = imageUrl.match(/\/d\/([^/]+)|id=([^&]+)/);
    const driveId = driveIdMatch ? (driveIdMatch[1] || driveIdMatch[2]) : null;

    if (!driveId) {
        return [
            imageUrl,
            `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=800&q=80&output=webp`
        ];
    }

    const directLink = `https://drive.google.com/uc?export=view&id=${driveId}`;
    
    return [
        // 1. PROXY (Fastest, caches, handles CORS well)
        `https://wsrv.nl/?url=${encodeURIComponent(directLink)}&w=800&q=80&output=webp`,
        
        // 2. GOOGLE THUMBNAIL API (Very robust)
        `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
        
        // 3. DIRECT EXPORT (Standard method, fallback)
        directLink
    ];
  }, [imageUrl]);

  const currentSrc = imageCandidates[currentCandidateIndex];

  // Reset when input changes
  useEffect(() => {
    if (imageUrl) {
        setImageState('loading');
        setCurrentCandidateIndex(0);
    } else {
        setImageState('error');
    }
  }, [imageUrl]);

  const handleImageError = () => {
    if (currentCandidateIndex < imageCandidates.length - 1) {
        console.log(`Image source ${currentCandidateIndex} failed. Trying next candidate...`);
        setCurrentCandidateIndex(prev => prev + 1);
    } else {
        setImageState('error');
    }
  };

  const handleImageLoad = () => {
      setImageState('success');
  };

  // ---------------------------------------------------------
  // SVG FALLBACK GENERATOR
  // ---------------------------------------------------------
  const svgFallbackUrl = useMemo(() => {
    const width = 600;
    const height = 900; 
    
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#004899;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#002a5c;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad1)"/>
        <text x="300" y="300" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="34" fill="white">Imagen no disponible</text>
        <text x="300" y="350" text-anchor="middle" font-family="Arial" font-size="24" fill="white" opacity="0.7">Pase Digital de Respaldo</text>
        
        <!-- Mock Barcode Area -->
        <rect x="50" y="750" width="500" height="100" fill="white"/>
      </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
  }, []);


  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div id={`card-${memberId}`} className="relative w-full max-w-[340px] mx-auto perspective-1000 bg-white">
      
      {/* CARD CONTAINER */}
      {/* 
          CAMBIO CRÍTICO: Eliminado 'aspect-[9/16]' y 'h-full' en la imagen.
          Ahora usamos 'h-auto' para que el contenedor crezca según el tamaño real de la imagen.
          Esto evita recortar la parte inferior (código de barras).
      */}
      <div className="relative overflow-hidden rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-white transition-transform duration-500 hover:scale-[1.01] flex flex-col min-h-[200px]">
        
        {/* 1. IMAGE AREA */}
        <div className="relative w-full bg-gray-100">
            
            {/* A. LOADING INDICATOR */}
            {imageState === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10 min-h-[400px]">
                    <Loader2 className="w-8 h-8 animate-spin text-depor-blue mb-2" />
                    <p className="text-xs font-semibold text-gray-400">Cargando abono...</p>
                </div>
            )}

            {/* B. THE IMAGE - Natural Height */}
            {currentSrc && (
                <img 
                    src={currentSrc}
                    alt="Abono"
                    className={`w-full h-auto block transition-all duration-700 ${imageState === 'success' ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{ WebkitUserDrag: 'none' }}
                />
            )}

            {/* C. FALLBACK */}
            {imageState === 'error' && (
                <div className="flex flex-col bg-gray-800 z-10 h-[500px]">
                    <img src={svgFallbackUrl} alt="Pase Fallback" className="w-full h-full object-cover" />
                    <div className="absolute bottom-20 left-0 w-full px-4 text-center">
                        <div className="bg-orange-500 text-white text-sm p-3 rounded font-bold">
                            Imagen original no disponible
                        </div>
                    </div>
                </div>
            )}

            {/* 2. TOP DATA OVERLAY (Zona Naranja) */}
            <div className="absolute top-0 left-0 w-full pt-6 pb-12 px-5 bg-gradient-to-b from-black/60 via-black/20 to-transparent z-30 pointer-events-none">
                 <div className="flex flex-col items-start w-full drop-shadow-md">
                    <h2 className="text-2xl font-black text-white leading-tight uppercase tracking-tight" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        {memberName}
                    </h2>
                    <div className="mt-2 w-full flex items-center justify-between">
                        {/* ID Badge */}
                        <span className="bg-white/20 backdrop-blur-md text-white text-[11px] font-bold px-2 py-0.5 rounded border border-white/30 shadow-sm">
                            ID: {memberId}
                        </span>
                        
                        {/* Expiration Badge */}
                        <span className="flex items-center gap-1 bg-orange-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/20 shadow-sm animate-pulse">
                            <Clock className="w-3 h-3" />
                            CADUCA: {expirationString}
                        </span>
                    </div>
                 </div>
            </div>

            {/* 3. WATERMARK (Peña Logo) - ADJUSTED POSITION */}
            {/* Se baja un poco (top-[15%]) y se usa una altura del 40% para centrarlo visualmente en la mitad superior */}
            <div className="absolute top-[15%] left-0 w-full h-[40%] flex items-center justify-center pointer-events-none z-20 overflow-hidden">
                <img 
                    src={penaLogoUrl} 
                    alt="Marca de agua Peña" 
                    // mix-blend-multiply: Elimina el blanco haciendo que actúe como transparencia.
                    className="w-[40%] opacity-25 grayscale contrast-150 brightness-95 mix-blend-multiply"
                />
            </div>
            
            {/* Scanline Animation (Subtle) */}
            <div className="absolute top-0 w-full h-[1px] bg-white/30 shadow-[0_0_10px_rgba(255,255,255,0.4)] animate-[scan_4s_linear_infinite] pointer-events-none z-30"></div>
        </div>
        
        {/* Security Hologram Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-20 pointer-events-none z-40" style={{ mixBlendMode: 'overlay' }}></div>
      </div>
      
      <p className="text-center text-[10px] text-gray-400 mt-4 font-medium uppercase tracking-widest">
        Aumente el brillo de la pantalla al máximo
      </p>
    </div>
  );
};

export default CardCanvas;
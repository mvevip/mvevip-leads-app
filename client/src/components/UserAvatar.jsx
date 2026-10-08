import React from 'react';

/**
 * Obtiene las iniciales de 2 letras de un nombre (Ej: Carlos Miño -> CM, Juana Morales -> JM)
 */
export function getInitials(name) {
  if (!name) return 'U';
  // Quitar paréntesis como (Admin), (Asesor), etc.
  const cleaned = name.replace(/\(.*?\)/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Genera un color de fondo agradable y consistente basado en el nombre con la paleta de la app
 */
function getBgColor(name) {
  const colors = [
    'bg-neutral-800 text-[#9AC31C]',
    'bg-zinc-800 text-neutral-100',
    'bg-neutral-900 text-[#9AC31C]',
    'bg-stone-850 text-neutral-100',
    'bg-neutral-800 text-lime-400'
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function isValidCustomAvatar(url) {
  if (!url) return false;
  if (typeof url === 'string' && (url.includes('unsplash.com') || url.includes('placeholder') || url.includes('images.unsplash'))) {
    return false;
  }
  return true;
}

export default function UserAvatar({ user, name, avatarUrl, className = "w-10 h-10 text-xs", showBadge = false, badgeText = "+" }) {
  const [imgError, setImgError] = React.useState(false);
  const finalName = name || user?.name || "Usuario";
  const finalAvatar = avatarUrl !== undefined ? avatarUrl : user?.avatarUrl;

  const initials = getInitials(finalName);
  const bgStyle = getBgColor(finalName);
  const hasCustomAvatar = isValidCustomAvatar(finalAvatar) && !imgError;

  return (
    <div className="relative inline-block shrink-0">
      {hasCustomAvatar ? (
        <img
          src={finalAvatar}
          alt={finalName}
          onError={() => setImgError(true)}
          className={`${className} rounded-full object-cover border-2 border-white dark:border-neutral-800 shadow-xs`}
        />
      ) : (
        <div
          className={`${className} rounded-full flex items-center justify-center font-extrabold tracking-wider border-2 border-white dark:border-neutral-800 shadow-xs ${bgStyle}`}
        >
          {initials}
        </div>
      )}

      {showBadge && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#9AC31C] border-2 border-white dark:border-neutral-900 rounded-full flex items-center justify-center text-[8px] text-neutral-950 font-extrabold">
          {badgeText}
        </span>
      )}
    </div>
  );
}

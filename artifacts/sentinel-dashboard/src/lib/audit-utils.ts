export function isAnomalous(eventType: string, rationale?: string | null): boolean {
  if (eventType === "Error") return true;
  
  if (!rationale) return false;
  
  const lowerRationale = rationale.toLowerCase();
  const keywords = [
    "access denied", 
    "financial transfer", 
    "data export", 
    "unauthorized", 
    "permission"
  ];
  
  return keywords.some(keyword => lowerRationale.includes(keyword));
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return isoString;
  }
}

export function truncateHash(hash: string): string {
  if (!hash) return "N/A";
  if (hash.length <= 16) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}

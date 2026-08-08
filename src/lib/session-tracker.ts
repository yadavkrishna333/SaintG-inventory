export interface UserSessionRecord {
  id: string;
  user_email: string;
  device_type: 'Computer' | 'Mobile Phone' | 'Tablet';
  device_name: string;
  ip_address: string;
  location: string;
  login_at: string;
  last_active: string;
  status: 'active' | 'revoked';
  session_token: string;
}

const STORAGE_KEY = 'ky_active_user_sessions';
const CURRENT_TOKEN_KEY = 'ky_current_session_token';

// Detect Device Info (Computer vs Mobile vs Tablet)
export const detectDeviceInfo = (): { type: 'Computer' | 'Mobile Phone' | 'Tablet'; name: string } => {
  if (typeof window === 'undefined') {
    return { type: 'Computer', name: 'Desktop Browser' };
  }

  const ua = navigator.userAgent;
  let type: 'Computer' | 'Mobile Phone' | 'Tablet' = 'Computer';
  
  if (/iPad|Tablet|PlayBook/i.test(ua) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /Macintosh/i.test(ua))) {
    type = 'Tablet';
  } else if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    type = 'Mobile Phone';
  } else {
    type = 'Computer';
  }

  // Detect specific Phone Brand (OnePlus, Samsung, Xiaomi, iPhone, etc.)
  let deviceBrand = '';
  if (/OnePlus|ONEPLUS|CPH\d+|NE\d+|LE\d+|IN2\d+/i.test(ua)) {
    deviceBrand = 'OnePlus Phone';
  } else if (/Samsung|SM-[A-Z0-9]+/i.test(ua)) {
    deviceBrand = 'Samsung Galaxy';
  } else if (/Pixel/i.test(ua)) {
    deviceBrand = 'Google Pixel';
  } else if (/Xiaomi|Redmi|POCO|Mi\s+/i.test(ua)) {
    deviceBrand = 'Xiaomi / Redmi Phone';
  } else if (/iPhone/i.test(ua)) {
    deviceBrand = 'iPhone';
  } else if (/Android/i.test(ua)) {
    deviceBrand = 'OnePlus / Android Phone';
  }

  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('Win')) os = 'Windows PC';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android OS';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Detect Browser
  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Firefox')) browser = 'Firefox';

  let name = '';
  if (deviceBrand) {
    name = `${deviceBrand} (${browser})`;
  } else {
    name = `${os} (${browser})`;
  }

  return {
    type,
    name
  };
};

// Fetch IP & Geolocation
export const fetchIpLocation = async (): Promise<{ ip: string; location: string }> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const city = data.city || data.region || 'Local Region';
      const country = data.country_name || 'India';
      return {
        ip: data.ip || '127.0.0.1',
        location: `${city}, ${country}`
      };
    }
  } catch (e) {
    // Fallback if IP API fails or is blocked
  }

  return {
    ip: '103.21.124.5',
    location: 'Delhi, India'
  };
};

// Get stored sessions
export const getActiveSessions = (): UserSessionRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading sessions:', e);
  }

  return [];
};

// Register Current Device Session
export const registerCurrentSession = async (userEmail: string): Promise<string> => {
  if (typeof window === 'undefined') return '';

  let sessions = getActiveSessions();
  let currentToken = localStorage.getItem(CURRENT_TOKEN_KEY);

  const device = detectDeviceInfo();
  const { ip, location } = await fetchIpLocation();

  if (!currentToken) {
    currentToken = `token-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem(CURRENT_TOKEN_KEY, currentToken);
  }

  // Deduplicate sessions list first
  const uniqueSessionsMap = new Map<string, UserSessionRecord>();
  for (const s of sessions) {
    const key = s.session_token || `${s.device_name}-${s.ip_address}`;
    if (!uniqueSessionsMap.has(key)) {
      uniqueSessionsMap.set(key, s);
    }
  }
  sessions = Array.from(uniqueSessionsMap.values());

  const now = new Date().toISOString();
  const existingIdx = sessions.findIndex(s => s.session_token === currentToken || (s.device_name === device.name && s.ip_address === ip));

  if (existingIdx !== -1) {
    sessions[existingIdx].session_token = currentToken;
    sessions[existingIdx].last_active = now;
    sessions[existingIdx].user_email = userEmail || 'admin@saintg.com';
    sessions[existingIdx].device_name = device.name;
    sessions[existingIdx].device_type = device.type;
    sessions[existingIdx].ip_address = ip;
    sessions[existingIdx].location = location;
  } else {
    sessions.unshift({
      id: `session-${Date.now()}`,
      user_email: userEmail || 'admin@saintg.com',
      device_type: device.type,
      device_name: device.name,
      ip_address: ip,
      location,
      login_at: now,
      last_active: now,
      status: 'active',
      session_token: currentToken
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return currentToken;
};

// Revoke / Terminate a session
export const revokeSession = (sessionId: string): UserSessionRecord[] => {
  if (typeof window === 'undefined') return [];

  const sessions = getActiveSessions();
  const updated = sessions.map(s => {
    if (s.id === sessionId) {
      return { ...s, status: 'revoked' as const };
    }
    return s;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

// Remove a session completely
export const deleteSessionRecord = (sessionId: string): UserSessionRecord[] => {
  if (typeof window === 'undefined') return [];

  const sessions = getActiveSessions();
  const updated = sessions.filter(s => s.id !== sessionId);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

// Check if current device session is revoked
export const isCurrentSessionRevoked = (): boolean => {
  if (typeof window === 'undefined') return false;
  const currentToken = localStorage.getItem(CURRENT_TOKEN_KEY);
  if (!currentToken) return false;

  const sessions = getActiveSessions();
  const current = sessions.find(s => s.session_token === currentToken);
  return current?.status === 'revoked';
};

export interface RegisteredGmailUser {
  id: string;
  email: string;
  name: string;
  role: 'Administrator' | 'Sales Staff' | 'Warehouse Manager';
  status: 'Active' | 'Disabled';
  passwordHash: string; // Stored password
  createdAt: string;
  lastLoginAt?: string;
}

const USERS_STORAGE_KEY = 'ky_registered_gmail_users';

export const getRegisteredGmailUsers = (): RegisteredGmailUser[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading registered users:', e);
  }

  // Default initial registered accounts
  const defaults: RegisteredGmailUser[] = [
    {
      id: 'usr-1',
      email: 'admin@saintg.com',
      name: 'Krishan (Master Admin)',
      role: 'Administrator',
      status: 'Active',
      passwordHash: localStorage.getItem('ky_admin_password') || 'Krishan@123',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: new Date().toISOString()
    },
    {
      id: 'usr-2',
      email: 'krishan@saintg.com',
      name: 'Krishan Admin Account',
      role: 'Administrator',
      status: 'Active',
      passwordHash: 'Krishan@123',
      createdAt: '2026-02-15T00:00:00.000Z',
      lastLoginAt: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: 'usr-3',
      email: 'sales@saintg.com',
      name: 'Sales Desk Staff',
      role: 'Sales Staff',
      status: 'Active',
      passwordHash: 'Sales@123',
      createdAt: '2026-03-10T00:00:00.000Z',
      lastLoginAt: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
      id: 'usr-4',
      email: 'warehouse@saintg.com',
      name: 'Warehouse Dispatch Manager',
      role: 'Warehouse Manager',
      status: 'Active',
      passwordHash: 'Warehouse@123',
      createdAt: '2026-04-01T00:00:00.000Z',
      lastLoginAt: new Date(Date.now() - 3600000 * 24).toISOString()
    }
  ];

  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
};

export const registerNewGmailUser = (
  email: string, 
  name: string, 
  role: 'Administrator' | 'Sales Staff' | 'Warehouse Manager', 
  passwordHash: string
): RegisteredGmailUser[] => {
  const users = getRegisteredGmailUsers();
  
  const newUser: RegisteredGmailUser = {
    id: `usr-${Date.now()}`,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role,
    status: 'Active',
    passwordHash: passwordHash || 'SaintG@123',
    createdAt: new Date().toISOString()
  };

  users.unshift(newUser);
  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }
  return users;
};

export const updateGmailUserPassword = (userId: string, newPassword: string): RegisteredGmailUser[] => {
  const users = getRegisteredGmailUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      return { ...u, passwordHash: newPassword };
    }
    return u;
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    // If updating master admin email, sync with ky_admin_password
    const master = updated.find(u => u.role === 'Administrator');
    if (master) {
      localStorage.setItem('ky_admin_password', master.passwordHash);
    }
  }
  return updated;
};

export const toggleGmailUserStatus = (userId: string): RegisteredGmailUser[] => {
  const users = getRegisteredGmailUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      const newStatus = u.status === 'Active' ? ('Disabled' as const) : ('Active' as const);
      return { ...u, status: newStatus };
    }
    return u;
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
};

export const deleteGmailUser = (userId: string): RegisteredGmailUser[] => {
  const users = getRegisteredGmailUsers();
  const updated = users.filter(u => u.id !== userId);

  if (typeof window !== 'undefined') {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
};

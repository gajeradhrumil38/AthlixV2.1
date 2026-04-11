import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  deleteAccountLocal,
  getCurrentUserAsync,
  getProfile,
  LocalProfile as UserProfile,
  LocalUser as User,
  signOutLocal,
  subscribeToAuth,
  updateProfile as persistProfile,
} from '../lib/supabaseData';

type Session = { user: User } | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  deleteAccount: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId?: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const data = await getProfile(userId);
    setProfile(data);
  };

  const syncAuthState = async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    try {
      await loadProfile(nextSession?.user?.id ?? null);
    } catch (error) {
      console.warn('Failed to sync auth state:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const currentUser = await getCurrentUserAsync();
        await syncAuthState(currentUser ? { user: currentUser } : null);
      } catch (error) {
        console.warn('Failed to initialize auth:', error);
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    };

    initializeAuth();

    const unsubscribe = subscribeToAuth(async (nextUser) => {
      await syncAuthState(nextUser ? { user: nextUser } : null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    await loadProfile(user?.id ?? null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;

    const data = await persistProfile(user.id, updates);
    setProfile(data);
  };

  const signOut = async () => {
    await signOutLocal();
  };

  const deleteAccount = async () => {
    if (!user) return;
    await deleteAccountLocal(user.id);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, deleteAccount, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

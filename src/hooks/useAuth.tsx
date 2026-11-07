import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  profile: { full_name: string; email: string; avatar_url: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isStaff: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);
  // Tracks whose roles/profile are loaded, so a token refresh doesn't show the loading screen again.
  const loadedUserId = useRef<string | null>(null);

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email, avatar_url").eq("user_id", userId).single(),
    ]);
    if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
    if (profileRes.data) setProfile(profileRes.data);
  };

  // Keep `loading` true until the user's roles are known; otherwise role-guarded routes
  // redirect away on a page refresh before the roles arrive.
  const loadUser = (userId: string) => {
    if (loadedUserId.current === userId) return;
    loadedUserId.current = userId;
    setLoading(true);
    fetchUserData(userId).finally(() => setLoading(false));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (loadedUserId.current !== session.user.id) setLoading(true);
          // Deferred so Supabase calls don't run inside the auth callback.
          setTimeout(() => loadUser(session.user.id), 0);
        } else {
          loadedUserId.current = null;
          setRoles([]);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadUser(session.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await fetchUserData(user.id);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isStaff = hasRole("doctor") || hasRole("nurse") || hasRole("admin");
  const isAdmin = hasRole("admin");

  return (
    <AuthContext.Provider value={{ session, user, roles, profile, loading, signOut, refreshProfile, hasRole, isStaff, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

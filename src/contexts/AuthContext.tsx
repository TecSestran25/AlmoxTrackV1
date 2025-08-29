"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserData, UserData, getUserRole } from '@/lib/firestore';

type AppUser = User & UserData;

interface AuthContextType {
    user: AppUser | null;
    userRole: string | null;
    loading: boolean;
    reauthenticate: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
    user: null, 
    userRole: null, 
    loading: true, 
    reauthenticate: () => Promise.reject("AuthProvider not yet mounted.") 
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [firebaseUser, setFirebaseUser] = useState<User | null>(null); 
    const [user, setUser] = useState<AppUser | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setFirebaseUser(currentUser);

            if (currentUser) {
                const userData = await getUserData(currentUser.uid); 
                const role = await getUserRole(currentUser.uid);

                if (userData) {
                    const appUser = { ...currentUser, ...userData } as AppUser;
                    setUser(appUser);
                    setUserRole(role || null);
                } else {
                    setUser(currentUser as AppUser);
                    setUserRole(null);
                }
            } else {
                setUser(null);
                setUserRole(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const reauthenticate = async (password: string) => {
        if (!firebaseUser || !firebaseUser.email) {
            throw new Error("Nenhum usuário logado ou e-mail indisponível.");
        }
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);
    };

    const value = { user, userRole, loading, reauthenticate };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
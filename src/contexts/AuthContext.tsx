import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserData, UserData, getUserRole } from '@/lib/firestore';

// Estendendo o tipo User do Firebase para incluir nossos dados customizados
export type AppUser = User & UserData;

interface AuthContextType {
    user: AppUser | null;
    userRole: string | null;
    secretariaId: string | null; // <-- ADICIONADO
    loading: boolean;
    reauthenticate: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    secretariaId: null, // <-- ADICIONADO
    loading: true,
    reauthenticate: () => Promise.reject("AuthProvider not yet mounted.")
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [secretariaId, setSecretariaId] = useState<string | null>(null); // <-- ADICIONADO
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser) {
                // Busca os dados customizados do Firestore
                const userData = await getUserData(currentUser.uid);
                const role = await getUserRole(currentUser.uid);

                if (userData && userData.secretariaId) {
                    // Combina os dados do Firebase Auth com os dados do Firestore
                    const appUser: AppUser = { ...currentUser, ...userData };
                    setUser(appUser);
                    setUserRole(role || null);
                    setSecretariaId(userData.secretariaId); // <-- Ponto-chave: Seta o ID da secretaria
                } else {
                    // Caso de segurança: se o usuário não tiver secretariaId, não deve logar completamente
                    console.error("Usuário não possui secretariaId. Deslogando.");
                    auth.signOut();
                    setUser(null);
                    setUserRole(null);
                    setSecretariaId(null);
                }
            } else {
                // Limpa todos os estados ao deslogar
                setUser(null);
                setUserRole(null);
                setSecretariaId(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const reauthenticate = async (password: string) => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentUser.email) {
            throw new Error("Usuário não está logado ou não possui e-mail.");
        }
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
    };

    const value = {
        user,
        userRole,
        secretariaId, // <-- Disponibiliza o ID para a aplicação
        loading,
        reauthenticate
    };

    return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
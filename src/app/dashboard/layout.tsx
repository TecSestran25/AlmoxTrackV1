"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut, User } from "firebase/auth";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { MonitorSmartphone, Moon, Sun } from "lucide-react"
import {
    CircleUser,
    LogOut,
    Package,
    ArrowRightToLine,
    ArrowLeftFromLine,
    Settings,
    IterationCcw ,
    Warehouse,
    Loader2,
    MailPlus,
    ChartNoAxesCombined,
    Mailbox,
    ListChecks
} from "lucide-react";
import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarInset,
    SidebarTrigger,
    SidebarFooter,
    SidebarSeparator,
} from "@/components/ui/sidebar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge"; // --- NOVO: Importe o Badge ---
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore"; // Removido Timestamp que não era usado
import Image from "next/image";
import { useTheme } from "next-themes";


function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { toast } = useToast();
    const { user, loading, userRole } = useAuth();
    const { setTheme } = useTheme();
    const { theme } = useTheme();

    const logoSrc = theme === 'dark' ? "/LOGO_branco.png" : "/LOGO.png";
    
    // --- NOVO: Estado para contar as requisições pendentes ---
    const [pendingRequestsCount, setPendingRequestsCount] = React.useState(0);

    const allowedPathsByRole = React.useMemo(() => ({
        Requester: ["/dashboard/inventory", "/dashboard/request", "/dashboard/list_requests"],
        Operador: ["/dashboard", "/dashboard/inventory", "/dashboard/entry", "/dashboard/exit", "/dashboard/returns", "/dashboard/requests-management"],
        Admin: ["/dashboard", "/dashboard/inventory", "/dashboard/entry", "/dashboard/exit", "/dashboard/returns", "/dashboard/requests-management"],
    }), []);
    
    const [isVerificationComplete, setIsVerificationComplete] = React.useState(false);

    // --- LÓGICA DE NOTIFICAÇÃO E CONTAGEM ---
    React.useEffect(() => {
        if (userRole === 'Admin' || userRole === 'Operador') {
            const requestsCollection = collection(db, "requests");
            // Agora a consulta busca TODAS as requisições pendentes
            const q = query(requestsCollection, where('status', '==', 'pending'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                // Atualiza o estado com o número de documentos retornados
                setPendingRequestsCount(snapshot.size);

                // Lógica de notificação para NOVAS requisições continua a mesma
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        // Para não notificar requisições antigas ao carregar a página,
                        // podemos verificar se a data é recente.
                        const newRequest = change.doc.data();
                        const requestDate = newRequest.date ? new Date(newRequest.date) : new Date(0);
                        const now = new Date();
                        const fiveSecondsAgo = new Date(now.getTime() - 5000); // 5 segundos atrás
                        
                        if(requestDate > fiveSecondsAgo) {
                            toast({
                                title: "Nova Requisição Recebida!",
                                description: `${newRequest.requester} do setor ${newRequest.department} fez uma nova solicitação.`,
                                duration: 10000,
                            });
                        }
                    }
                });
            });

            // Limpa o listener
            return () => unsubscribe();
        }
    }, [userRole, toast]);
    // --- FIM DA LÓGICA ---

    React.useEffect(() => {
        if (!loading && user && userRole) {
            if (userRole in allowedPathsByRole) {
                const allowedPaths = allowedPathsByRole[userRole as keyof typeof allowedPathsByRole];
                
                if (!allowedPaths.includes(pathname)) {
                    if (userRole === 'Requester') {
                        router.replace('/dashboard/inventory');
                    } else {
                        router.replace('/dashboard');
                    }
                    toast({
                        title: "Acesso Negado",
                        description: "Você não tem permissão para acessar esta página.",
                        variant: "destructive",
                    });
                } else {
                    setIsVerificationComplete(true);
                }
            } else {
                router.replace('/login');
            }
        }
    }, [user, loading, userRole, pathname, router, allowedPathsByRole, toast]);

    const navItems = [
        { href: "/dashboard", icon: ChartNoAxesCombined, label: "Dashboard", roles: ["Admin", "Operador"] },
        { href: "/dashboard/inventory", icon: Package, label: "Inventário", roles: ["Admin", "Operador", "Requester"] },
        { href: "/dashboard/entry", icon: ArrowRightToLine, label: "Entrada", roles: ["Admin", "Operador"] },
        { href: "/dashboard/exit", icon: ArrowLeftFromLine, label: "Saída", roles: ["Admin", "Operador"] },
        { href: "/dashboard/returns", icon: IterationCcw, label: "Devolução", roles: ["Admin", "Operador"] },
        { href: "/dashboard/request", icon: MailPlus, label: "Requisições", roles: ["Requester"] },
        { href: "/dashboard/requests-management", icon: Mailbox, label: "Gerenciar Requisições", roles: ["Admin", "Operador"] },
        { href: "/dashboard/list_requests", icon: ListChecks, label: "Minhas Requisições", roles: ["Requester"] },
    ];

    const allowedItems = React.useMemo(() => {
        if (!userRole) return [];
        return navItems.filter(item => item.roles.includes(userRole));
    }, [navItems, userRole]);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            toast({ 
                title: "Você saiu com sucesso.",
                description: "Redirecionando para a página de login.",
                variant: "success",
            });
            router.push("/login");
        } catch (error) {
            toast({
                title: "Erro ao sair",
                description: "Não foi possível fazer logout. Tente novamente.",
                variant: "destructive",
            });
        }
    };

    if (loading || !user || !isVerificationComplete) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <SidebarProvider>
            <Sidebar className="hidden lg:flex lg:w-64" collapsible="offcanvas" >
                <SidebarHeader className="mb-3 ml-5">
                    <Image 
                        src={logoSrc} 
                        width={500} 
                        height={40} 
                        alt="SESTRANS-Goiana" 
                    />
                    <div className="flex items-center gap-2 p-2">
                        <Warehouse className="w-8 h-8 text-primary" />
                        <span className="text-xl font-semibold mt-1">AlmoxTrack</span>
                    </div>
                </SidebarHeader>
                <hr className="mx-6" />
                <SidebarContent className="mt-4">
                    <SidebarMenu>
                        {allowedItems.map((item) => (
                            <SidebarMenuItem key={item.label}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={pathname === item.href}
                                    tooltip={item.label}
                                    className="h-12 justify-start"
                                >
                                    <Link href={item.href} className="flex items-center justify-between w-full">
                                        <div className="flex items-center">
                                            <item.icon className="mr-2 h-5 w-5" /> 
                                            <span>{item.label}</span>
                                        </div>
                                        {/* --- MOSTRAR O BADGE DE CONTAGEM --- */}
                                        {item.href === "/dashboard/requests-management" && pendingRequestsCount > 0 && (
                                            <Badge className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                                                {pendingRequestsCount}
                                            </Badge>
                                        )}
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>
                <SidebarSeparator />
                <SidebarFooter className="mb-5 mt-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="justify-start w-full h-auto px-2 py-2">
                                <div className="flex justify-between w-full items-center">
                                    <div className="flex gap-2 items-center">
                                    <Avatar className="w-8 h-8">
                                        <AvatarFallback>{user.email ? user.email[0].toUpperCase() : 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col items-start text-sm">
                                        <span className="font-medium text-sidebar-foreground">
                                            {user.email && user.email.length > 18
                                                ? `${user.email.substring(0, 18)}...`
                                                : user.email}
                                        </span>
                                        <span className="text-muted-foreground text-xs">{userRole}</span>
                                    </div>
                                    </div>
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                    <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                    <span>Tema</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={() => setTheme("light")}>
                                            <Sun className="mr-2 h-4 w-4" />
                                            <span>Claro</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setTheme("dark")}>
                                            <Moon className="mr-2 h-4 w-4" />
                                            <span>Escuro</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setTheme("system")}>
                                            <MonitorSmartphone className="mr-2 h-4 w-4" />
                                            <span>Sistema</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6 lg:hidden">
                    <SidebarTrigger className="-ml-2" />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                            variant="outline"
                            size="icon"
                            className="overflow-hidden rounded-full ml-auto"
                            >
                            <CircleUser className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>{user.name || userRole}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                    <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                    <span>Tema</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={() => setTheme("light")}>
                                            <Sun className="mr-2 h-4 w-4" />
                                            <span>Claro</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setTheme("dark")}>
                                            <Moon className="mr-2 h-4 w-4" />
                                            <span>Escuro</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setTheme("system")}>
                                            <MonitorSmartphone className="mr-2 h-4 w-4" />
                                            <span>Sistema</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>
                <main className="flex-1 p-4 sm:px-6 sm:py-6">{children}</main>
            </SidebarInset>
        </SidebarProvider>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <DashboardLayoutContent>{children}</DashboardLayoutContent>
        </AuthProvider>
    );
}
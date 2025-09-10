"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, X, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getPendingRequests, rejectRequest, RequestData } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function RequestsManagementPage() {
    const [pendingRequests, setPendingRequests] = React.useState<RequestData[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = React.useState("");
    const [requestToReject, setRequestToReject] = React.useState<RequestData | null>(null);
    // 1. Obter o secretariaId do contexto
    const { user, secretariaId } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const fetchRequests = React.useCallback(async () => {
        // 2. Guarda de segurança
        if (!secretariaId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            // 3. Passar o secretariaId para a função
            const requests = await getPendingRequests(secretariaId);
            setPendingRequests(requests);
        } catch (error: any) {
            toast({
                title: "Erro ao carregar requisições",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    // 4. Adicionar secretariaId como dependência
    }, [toast, secretariaId]);

    React.useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleApproveAndRedirect = (request: RequestData) => {
        setIsProcessing(request.id);
        // A lógica de codificar e redirecionar não precisa do secretariaId aqui,
        // pois a página de 'exit' que receberá os dados já é multitenant.
        try {
            const exitData = {
                requester: request.requester,
                department: request.department,
                purpose: request.purpose,
                items: request.items.map(item => ({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    quantity: item.quantity,
                    unit: item.unit,
                    isPerishable: item.isPerishable,
                    expirationDate: item.expirationDate,
                })),
            };

            const encodedData = btoa(JSON.stringify(exitData));
            const firstItemType = request.items[0]?.type || 'consumo';
            const tabToOpen = firstItemType === 'permanente' ? 'responsibility' : 'consumption';

            // O requestId já é um identificador único global
            router.push(`/dashboard/exit?tab=${tabToOpen}&requestData=${encodedData}&requestId=${request.id}`);

        } catch (error: any) {
            toast({ title: "Erro ao preparar dados", description: error.message, variant: "destructive" });
            setIsProcessing(null);
        }
    };

    const handleReject = async (requestId: string, reason: string) => {
        // 2. Guarda de segurança
        if (!user?.email || !secretariaId) {
            toast({ title: "Erro de autenticação", variant: "destructive" });
            return;
        }

        if (!reason || !reason.trim()) {
            toast({ title: "Motivo obrigatório", variant: "destructive" });
            return;
        }

        setIsProcessing(requestId);
        try {
            // 3. Passar o secretariaId para a função
            await rejectRequest(secretariaId, requestId, user.email, reason);

            toast({ title: "Requisição Rejeitada!", variant: "default" });
            setRequestToReject(null);
            setRejectionReason("");
            fetchRequests(); // Recarrega a lista de pendentes

        } catch (error: any) {
            toast({ title: "Erro ao Rejeitar", description: error.message, variant: "destructive" });
        } finally {
            setIsProcessing(null);
        }
    };
    
    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Requisições Pendentes</CardTitle>
                    <CardDescription>Gerencie as solicitações de materiais de consumo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-x-auto max-h-[70vh]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Solicitante</TableHead>
                                    <TableHead>Departamento</TableHead>
                                    <TableHead>Itens</TableHead>
                                    <TableHead className="w-[150px] text-center">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">Carregando...</TableCell>
                                    </TableRow>
                                ) : pendingRequests.length > 0 ? (
                                    pendingRequests.map(request => (
                                        <TableRow key={request.id}>
                                            <TableCell>{format(parseISO(request.date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{request.requester}</div>
                                            </TableCell>
                                            <TableCell>{request.department}</TableCell>
                                            <TableCell>
                                                <ul className="list-disc pl-4">
                                                    {request.items.map(item => (
                                                        <li key={item.id}>
                                                            {item.name} ({item.quantity} {item.unit})
                                                        </li>
                                                    ))}
                                                </ul>
                                            </TableCell>
                                            <TableCell className="text-center space-x-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-green-600 hover:bg-green-100"
                                                    onClick={() => handleApproveAndRedirect(request)}
                                                    disabled={isProcessing === request.id}
                                                >
                                                    {isProcessing === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-600 hover:bg-red-100"
                                                    // 👇 ALTERE ESTA LINHA 👇
                                                    onClick={() => setRequestToReject(request)} 
                                                    disabled={isProcessing === request.id}
                                                >
                                                    {isProcessing === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                                            Nenhuma requisição pendente.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            <AlertDialog open={!!requestToReject} onOpenChange={(isOpen) => !isOpen && setRequestToReject(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Rejeitar Requisição</AlertDialogTitle>
                        <AlertDialogDescription>
                            Por favor, informe o motivo da rejeição. Esta informação será visível para o solicitante.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                        placeholder="Ex: Estoque insuficiente, item fora de linha, etc."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setRequestToReject(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => handleReject(requestToReject!.id, rejectionReason)}
                            disabled={!rejectionReason.trim()}
                        >
                            Confirmar Rejeição
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
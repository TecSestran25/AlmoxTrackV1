"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ItemSearch } from "../../dashboard/components/item-search";
import type { Product, RequestItem } from "@/lib/firestore";
import { createRequest } from "@/lib/firestore";
import { useAuth, AppUser } from "@/contexts/AuthContext"; // Importar AppUser

export default function ItemRequestForm() {
    const { toast } = useToast();
    // 1. Obter o secretariaId do contexto
    const { user, secretariaId } = useAuth();

    // Estados do formulário
    const [requesterName, setRequesterName] = React.useState("");
    const [requesterId, setRequesterId] = React.useState("");
    const [department, setDepartment] = React.useState("");
    const [purpose, setPurpose] = React.useState("");
    const [quantity, setQuantity] = React.useState(1);
    const [requestedItems, setRequestedItems] = React.useState<RequestItem[]>([]);
    const [selectedItem, setSelectedItem] = React.useState<Product | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    React.useEffect(() => {
        // Popula os dados do usuário quando o contexto é carregado
        if (user) {
            setRequesterName(user.name || "");
            // CORREÇÃO: Acessar 'id' (matrícula) de forma segura
            setRequesterId((user as AppUser).id || ""); 
            setDepartment(user.department || "");
        }
    }, [user]);

    const handleAddItem = () => {
        // 2. Guarda de segurança para o secretariaId
        if (!secretariaId) {
            toast({ title: "Erro de autenticação", description: "Secretaria não identificada.", variant: "destructive" });
            return;
        }
        if (!selectedItem || !selectedItem.id) {
            toast({ title: "Nenhum item selecionado", variant: "destructive" });
            return;
        }
        if (quantity <= 0) {
            toast({ title: "Quantidade inválida", variant: "destructive" });
            return;
        }

        const existingItem = requestedItems.find((i) => i.id === selectedItem.id);
        const currentRequestedQty = existingItem ? existingItem.quantity : 0;
        
        if (selectedItem.quantity < currentRequestedQty + quantity) {
            toast({ title: "Estoque insuficiente", description: `A quantidade total solicitada (${currentRequestedQty + quantity}) é maior que a disponível (${selectedItem.quantity}).`, variant: "destructive" });
            return;
        }

        setRequestedItems((prev) => {
            if (existingItem) {
                return prev.map((i) => i.id === selectedItem.id ? { ...i, quantity: i.quantity + quantity } : i);
            }
            // CORREÇÃO: Adicionar secretariaId ao novo item
            const newItem: RequestItem = {
                id: selectedItem.id,
                secretariaId: secretariaId, // Adicionado
                name: selectedItem.name,
                quantity,
                unit: selectedItem.unit,
                isPerishable: selectedItem.isPerishable || 'Não',
                expirationDate: selectedItem.expirationDate || '',
                type: selectedItem.type,
            };
            
            return [...prev, newItem];
        });

        setSelectedItem(null);
        setQuantity(1);
    };

    const handleRemoveItem = (itemId: string) => {
        setRequestedItems(prev => prev.filter(item => item.id !== itemId));
    };

    const handleSubmitRequest = async () => {
        if (!user?.uid || !secretariaId) {
            toast({ title: "Erro de Autenticação", variant: "destructive" });
            return;
        }
        if (requestedItems.length === 0) {
            toast({ title: "Nenhum item solicitado", variant: "destructive" });
            return;
        }
        if (!requesterName || !department) {
            toast({ title: "Campos obrigatórios", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const requestDataToSend = {
                items: requestedItems,
                date: new Date().toISOString(),
                requester: requesterId ? `${requesterName} (${requesterId})` : requesterName,
                department: department,
                purpose: purpose || '',
                requestedByUid: user.uid,
            };

            // 3. Passar o secretariaId para a função createRequest
            await createRequest(secretariaId, requestDataToSend);

            toast({ title: "Solicitação Enviada!", variant: "success" });

            // Limpar formulário
            setRequestedItems([]);
            setPurpose("");
            if (user) {
                setRequesterName(user.name || "");
                setRequesterId((user as AppUser).id || "");
                setDepartment(user.department || "");
            }
        } catch (error: any) {
            toast({ title: "Erro ao Enviar Solicitação", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="requester-name" className="text-sm font-medium">Nome do Solicitante</label>
                            <Input id="requester-name" value={requesterName} onChange={e => setRequesterName(e.target.value)} disabled={!!user?.name} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="requester-id" className="text-sm font-medium">Matrícula do Solicitante</label>
                            <Input id="requester-id" value={requesterId} onChange={e => setRequesterId(e.target.value)} disabled={!!user?.id} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="department" className="text-sm font-medium">Setor/Departamento</label>
                            <Select onValueChange={setDepartment} value={department} disabled={!!user?.department}>
                                <SelectTrigger id="department">
                                    <SelectValue placeholder="Selecione um setor" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Secretario">Gabinete do secretário</SelectItem>
                                    <SelectItem value="LicitacaoEContrato">Setor de licitação</SelectItem>
                                    <SelectItem value="Monitoramento">Setor do Monitoramento</SelectItem>
                                    <SelectItem value="Guarda">Comando da GCM</SelectItem>
                                    <SelectItem value="Vigilancia">Gerência da Vigilância</SelectItem>
                                    <SelectItem value="Administracao">Departamento Administrativo</SelectItem>
                                    <SelectItem value="Tecnologia">Setor de T.I</SelectItem>
                                    <SelectItem value="Transito">Gerência de trânsito</SelectItem>
                                    <SelectItem value="Transporte">Gerência de transporte</SelectItem>
                                    <SelectItem value="Engenharia">Setor de engenharia</SelectItem>
                                    <SelectItem value="Limpeza">Limpeza</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="purpose" className="text-sm font-medium">Finalidade de Uso</label>
                        <Textarea id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Itens Solicitados</CardTitle>
                            <div className="flex flex-col md:flex-row items-end gap-2 pt-4">
                                <ItemSearch onSelectItem={setSelectedItem} placeholder="Buscar item disponível..." searchId="request-search" />
                                <div className="w-full md:w-24">
                                    <label htmlFor="quantity-request" className="text-sm font-medium">Qtd.</label>
                                    <Input id="quantity-request" type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min="1" />
                                </div>
                                <Button onClick={handleAddItem} className="w-full md:w-auto">Adicionar</Button>
                            </div>
                            {selectedItem && (
                                <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                                    Item selecionado: <span className="font-medium">{selectedItem.name}</span> (Disponível: {selectedItem.quantity})
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-md overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="w-[100px] text-right">Qtd</TableHead>
                                            <TableHead className="w-[100px] text-center">Ação</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requestedItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center text-muted-foreground">
                                                    Nenhum item solicitado.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            requestedItems.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.name}</TableCell>
                                                    <TableCell className="text-right">{`${item.quantity} ${item.unit}`}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-100" onClick={() => handleRemoveItem(item.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="flex justify-end mt-6">
                    <Button size="lg" variant="accent" onClick={handleSubmitRequest} disabled={isSubmitting || requestedItems.length === 0}>
                        {isSubmitting ? "Enviando..." : "Enviar Solicitação"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
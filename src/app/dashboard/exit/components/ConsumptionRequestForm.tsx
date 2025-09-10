"use client";

import * as React from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, Trash2, Edit } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/firestore";
import { finalizeExit, getProductById } from "@/lib/firestore";
import { ItemSearch } from "../../components/item-search";
import { useAuth } from "@/contexts/AuthContext";

type RequestedItem = {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    isPerishable?: 'Sim' | 'Não';
    expirationDate?: string;
    originalProduct: Product;
};

export default function ConsumptionRequestPage() {
    return (
        <React.Suspense fallback={<div className="p-8 text-center">Carregando...</div>}>
            <ConsumptionRequestForm />
        </React.Suspense>
    )
}

function ConsumptionRequestForm() {
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, secretariaId } = useAuth(); // Obtenha o secretariaId

    // Estados do Formulário
    const [requestDate, setRequestDate] = React.useState<Date | undefined>(new Date());
    const [requesterName, setRequesterName] = React.useState("");
    const [requesterId, setRequesterId] = React.useState("");
    const [department, setDepartment] = React.useState("");
    const [purpose, setPurpose] = React.useState("");
    const [isFinalizing, setIsFinalizing] = React.useState(false);
    const [requestId, setRequestId] = React.useState<string | null>(null);
    
    // Estados da Lista de Itens
    const [requestedItems, setRequestedItems] = React.useState<RequestedItem[]>([]);
    const [selectedItem, setSelectedItem] = React.useState<Product | null>(null);
    const [quantity, setQuantity] = React.useState(1);

    React.useEffect(() => {
        const requestDataParam = searchParams.get('requestData');
        const requestIdParam = searchParams.get('requestId');
        if (requestIdParam) setRequestId(requestIdParam);

        if (requestDataParam) {
            try {
                const decodedData = JSON.parse(atob(requestDataParam));
                const requesterMatch = decodedData.requester.match(/(.*) \((.*)\)/);
                if (requesterMatch) {
                    setRequesterName(requesterMatch[1]);
                    setRequesterId(requesterMatch[2]);
                } else {
                    setRequesterName(decodedData.requester);
                }
                setDepartment(decodedData.department);
                setPurpose(decodedData.purpose || '');
                setRequestedItems(decodedData.items.map((item: any) => ({...item, originalProduct: item})));
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (error) {
                console.error("Erro ao decodificar dados da URL:", error);
                toast({ title: "Erro", description: "Não foi possível carregar os dados da requisição.", variant: "destructive" });
            }
        }
    }, [searchParams, toast]);

    const handleAddItem = () => {
        if (!selectedItem) {
            toast({ title: "Erro", description: "Por favor, busque e selecione um item.", variant: "destructive" });
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
            return [...prev, {
                id: selectedItem.id,
                name: selectedItem.name,
                quantity,
                unit: selectedItem.unit,
                isPerishable: selectedItem.isPerishable,
                expirationDate: selectedItem.expirationDate,
                originalProduct: selectedItem,
            }];
        });

        setSelectedItem(null);
        setQuantity(1);
    };

    const handleRemoveItem = (itemId: string) => {
        setRequestedItems(prev => prev.filter(item => item.id !== itemId));
    };

    const handleEditClick = async (itemToEdit: RequestedItem) => {
        if (!secretariaId) return; // Guarda de segurança
        toast({ title: "Carregando dados atualizados do item..." });
        try {
            // Passe o secretariaId para a função
            const liveProductData = await getProductById(secretariaId, itemToEdit.id);

            if (!liveProductData) {
                toast({ title: "Erro ao carregar item", variant: "destructive" });
                return;
            }
            setSelectedItem(null);
            setSelectedItem(liveProductData);
            
            setQuantity(itemToEdit.quantity);
            handleRemoveItem(itemToEdit.id);

            toast({ title: "Item pronto para edição", description: `Ajuste a quantidade e adicione novamente.` });

        } catch (error) {
            toast({ title: "Erro de Conexão", variant: "destructive" });
        }
    };
    
    const handleFinalizeIssue = async () => {
        if (!secretariaId || !user) {
            toast({ title: "Erro de autenticação", variant: "destructive" });
            return;
        }
        if (requestedItems.length === 0 || !requesterName || !department) {
            toast({ title: "Campos obrigatórios", variant: "destructive" });
            return;
        }
        
        setIsFinalizing(true);
        try {
            const exitData = {
                items: requestedItems,
                date: requestDate?.toISOString() || new Date().toISOString(),
                requester: requesterId ? `${requesterName} (${requesterId})` : requesterName,
                department: department,
                purpose: purpose,
                responsible: user.email || "Desconhecido",
            };

            // Passe o secretariaId para a função
            await finalizeExit(secretariaId, exitData, requestId || undefined);
            
            toast({ title: "Saída Registrada!", variant: "success" });
            
            if (requestId) {
                router.push('/dashboard/requests-management');
            } else {
                setRequestDate(new Date());
                setRequesterName("");
                setRequesterId("");
                setDepartment("");
                setPurpose("");
                setRequestedItems([]);
            }

        } catch (error: any) {
            toast({ title: "Erro ao Finalizar Saída", description: error.message, variant: "destructive" });
        } finally {
            setIsFinalizing(false);
        }
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="request-date" className="text-sm font-medium">Data da Solicitação</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="request-date"
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !requestDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {requestDate ? format(requestDate, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={requestDate} onSelect={setRequestDate} initialFocus locale={ptBR} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="requester-name" className="text-sm font-medium">Nome do Solicitante</label>
                            <Input id="requester-name" value={requesterName} onChange={e => setRequesterName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="requester-id" className="text-sm font-medium">Matrícula do Solicitante</label>
                            <Input id="requester-id" value={requesterId} onChange={e => setRequesterId(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="department" className="text-sm font-medium">Setor/Departamento</label>
                        <Select onValueChange={setDepartment} value={department}>
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
                    <div className="space-y-2">
                        <label htmlFor="purpose" className="text-sm font-medium">Finalidade de Uso</label>
                        <Textarea id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)} />
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Itens Solicitados</CardTitle>
                            <div className="flex flex-col md:flex-row items-end gap-2 pt-4">
                                <ItemSearch onSelectItem={setSelectedItem} placeholder="Buscar item disponível..." searchId="consumption-search" />
                                <div className="w-full md:w-24">
                                    <label htmlFor="quantity-consumption" className="text-sm font-medium">Qtd.</label>
                                    <Input id="quantity-consumption" type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min="1"/>
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
                                            <TableHead>Validade</TableHead>
                                            <TableHead className="w-[100px] text-right">Qtd</TableHead>
                                            <TableHead className="w-[120px] text-center">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {requestedItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum item solicitado.</TableCell>
                                            </TableRow>
                                        ) : (
                                            requestedItems.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.name}</TableCell>
                                                    <TableCell>{item.expirationDate ? format(parseISO(item.expirationDate), 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                                    <TableCell className="text-right">{`${item.quantity} ${item.unit}`}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex justify-center items-center gap-1">
                                                            {/* BOTÃO DE EDITAR CHAMA A NOVA FUNÇÃO SIMPLES */}
                                                            <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-100" onClick={() => handleEditClick(item)}>
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-100" onClick={() => handleRemoveItem(item.id)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
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
                    <Button size="lg" variant="accent" onClick={handleFinalizeIssue} disabled={isFinalizing || requestedItems.length === 0}>
                        {isFinalizing ? "Finalizando..." : "Finalizar Saída"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
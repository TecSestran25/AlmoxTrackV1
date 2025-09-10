"use client";

import * as React from "react";
import Image from "next/image";
import { PlusCircle, Search, History, Edit, MoreHorizontal, Trash2, AlertTriangle, BadgeAlert, FileDown } from "lucide-react";
import { format, differenceInMonths, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,       
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Product, Movement } from "@/lib/firestore";
import { getProducts, addProduct, updateProduct, deleteProduct, addMovement, uploadImage, generateNextItemCode, getMovementsForProducts , getAllProducts} from "@/lib/firestore"; 
import { DocumentSnapshot, DocumentData } from "firebase/firestore";

import { AddItemSheet } from "./components/add-item-sheet";
import { EditItemSheet } from "./components/edit-item-sheet";
import { MovementsSheet } from "./components/movements-sheet";
import { ReauthDialog } from "../components/reauth-dialog";

// Funções auxiliares de UI (sem alterações)
const getExpirationStatus = (expirationDate?: string): 'alert' | 'warning' | 'reminder' | null => {
  if (!expirationDate) return null;
  const today = new Date();
  const expiresOn = parseISO(expirationDate);
  const monthsDifference = differenceInMonths(expiresOn, today);

  if (monthsDifference < 1) return 'alert';
  if (monthsDifference < 2) return 'warning';
  if (monthsDifference < 3) return 'reminder';
  return null;
};
const getAlertIcon = (status: 'alert' | 'warning' | 'reminder' | null) => {
    switch(status) {
        case 'alert': return <AlertTriangle className="h-4 w-4 text-red-500" />;
        case 'warning': return <BadgeAlert className="h-4 w-4 text-orange-500" />;
        case 'reminder': return <BadgeAlert className="h-4 w-4 text-yellow-500" />;
        default: return null;
    }
};
const getTooltipText = (status: 'alert' | 'warning' | 'reminder' | null, date: string) => {
    switch(status) {
        case 'alert': return `Vencimento muito próximo: ${format(parseISO(date), 'dd/MM/yyyy')}`;
        case 'warning': return `Vencimento em breve: ${format(parseISO(date), 'dd/MM/yyyy')}`;
        case 'reminder': return `Lembrete: Vencimento em ${format(parseISO(date), 'dd/MM/yyyy')}`;
        default: return '';
    }
}

export default function InventoryPage() {
  // 1. Obter o secretariaId do contexto
  const { user, userRole, secretariaId } = useAuth();
  const { toast } = useToast();
  
  const [products, setProducts] = React.useState<(Product & { calculatedExpirationDate?: string })[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isExporting, setIsExporting] = React.useState(false);

  // ... (outros estados de UI e paginação sem alterações)
  const [isAddSheetOpen, setIsAddSheetOpen] = React.useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = React.useState(false);
  const [isMovementsSheetOpen, setIsMovementsSheetOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<Product | null>(null);
  const [isReauthOpen, setIsReauthOpen] = React.useState(false);
  const [actionToConfirm, setActionToConfirm] = React.useState<(() => void) | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageCursors, setPageCursors] = React.useState<(DocumentSnapshot<DocumentData> | undefined)[]>([undefined]);
  const [hasNextPage, setHasNextPage] = React.useState(true);
  const PAGE_SIZE = 8;

  const fetchProducts = React.useCallback(async (term: string, page: number = 1, cursor?: DocumentSnapshot<DocumentData>) => {
    // 2. Guarda de segurança: não fazer nada se o secretariaId não estiver carregado
    if (!secretariaId) {
        setIsLoading(false); // Garante que o loading não fique preso
        return;
    }

    setIsLoading(true);
    try {
      // 3. Passar o secretariaId para getProducts
      const { products: productsFromDb, lastDoc } = await getProducts(secretariaId, { searchTerm: term }, PAGE_SIZE, cursor);

      const perishableProductIds = productsFromDb.filter(p => p.isPerishable === 'Sim').map(p => p.id);
      let movementsByProduct = new Map<string, Movement[]>();

      if (perishableProductIds.length > 0) {
        // 3. Passar o secretariaId para getMovementsForProducts
        const allMovements = await getMovementsForProducts(secretariaId, perishableProductIds);
        for (const movement of allMovements) {
            if (!movementsByProduct.has(movement.productId)) {
                movementsByProduct.set(movement.productId, []);
            }
            movementsByProduct.get(movement.productId)!.push(movement);
        }
      }

      // ... (lógica de cálculo de validade continua igual)
      const productsWithAlerts = productsFromDb.map(product => {
        if (product.isPerishable !== 'Sim') {
          return { ...product, calculatedExpirationDate: undefined };
        }
        const movements = movementsByProduct.get(product.id) || [];
        const entradas = movements.filter(m => m.type === 'Entrada' && m.expirationDate).sort((a, b) => parseISO(a.expirationDate!).getTime() - parseISO(b.expirationDate!).getTime());
        const saidas = movements.filter(m => m.type === 'Saída').reduce((sum, m) => sum + m.quantity, 0);
        let remainingSaidas = saidas;
        let earliestExpirationDate = undefined;
        for (const entrada of entradas) {
          if (remainingSaidas < entrada.quantity) {
            earliestExpirationDate = entrada.expirationDate;
            break;
          }
          remainingSaidas -= entrada.quantity;
        }
        return { ...product, calculatedExpirationDate: earliestExpirationDate };
      });
      
      setProducts(productsWithAlerts);
      setHasNextPage(productsFromDb.length === PAGE_SIZE);
      if (lastDoc) {
        setPageCursors(prev => {
          const newCursors = [...prev];
          newCursors[page] = lastDoc;
          return newCursors;
        });
      }
    } catch (error: any) {
      console.error("Erro ao buscar produtos:", error);
      toast({
          title: "Erro ao Carregar Produtos",
          description: error.message,
          variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  // 4. Adicionar secretariaId como dependência
  }, [toast, secretariaId]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setCurrentPage(1);
      setPageCursors([undefined]);
      fetchProducts(searchTerm, 1, undefined);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, fetchProducts]); // fetchProducts já tem secretariaId na sua dependência

  const handleNextPage = () => { if (hasNextPage) { const nextPage = currentPage + 1; fetchProducts(searchTerm, nextPage, pageCursors[currentPage]); setCurrentPage(nextPage); }};
  const handlePreviousPage = () => { if (currentPage > 1) { const prevPage = currentPage - 1; fetchProducts(searchTerm, prevPage, pageCursors[prevPage - 1]); setCurrentPage(prevPage); }};
  const refreshAndGoToFirstPage = () => { setSearchTerm(""); setCurrentPage(1); setPageCursors([undefined]); fetchProducts("", 1, undefined); }

  const handleAddItem = React.useCallback(async (newItemData: any) => {
    if (!secretariaId) return; // Guarda de segurança
    setIsLoading(true);
    try {
      let imageUrl = "https://placehold.co/40x40.png";
      if (newItemData.image) imageUrl = await uploadImage(newItemData.image);
      
      const categoryPrefix = newItemData.category.substring(0, 3).toUpperCase();
      const namePrefix = newItemData.name.substring(0, 3).toUpperCase();
      const codePrefix = `${categoryPrefix}-${namePrefix}`;
      // 3. Passar secretariaId
      const generatedCode = await generateNextItemCode(secretariaId, codePrefix);
      const finalCategory = newItemData.category === 'Outro' ? newItemData.otherCategory : newItemData.category;

      const newProduct: Omit<Product, 'id' | 'secretariaId'> = {
        name: newItemData.name,
        name_lowercase: newItemData.name.toLowerCase(),
        code: generatedCode,
        patrimony: newItemData.materialType === 'permanente' ? (newItemData.patrimony ?? '') : 'N/A',
        type: newItemData.materialType,
        quantity: newItemData.initialQuantity || 0,
        unit: newItemData.unit,
        category: finalCategory || '',
        image: imageUrl,
        reference: newItemData.reference || '',
        isPerishable: newItemData.isPerishable,
      };

      // 3. Passar secretariaId
      const newProductId = await addProduct(secretariaId, newProduct);
      if (newProduct.quantity > 0) {
        // 3. Passar secretariaId
        await addMovement(secretariaId, {
          productId: newProductId,
          date: new Date().toISOString(),
          type: 'Entrada',
          quantity: newProduct.quantity,
          responsible: user?.email || 'Desconhecido',
        });
      }
      toast({ title: "Item Adicionado!", variant: "success" });
      refreshAndGoToFirstPage();
    } catch (error: any) {
      toast({ title: "Erro ao Adicionar Item", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  // 4. Adicionar secretariaId como dependência
  }, [user, toast, secretariaId]);

  const handleUpdateItem = React.useCallback(async (updatedItemData: any) => {
    if (!selectedItem || !secretariaId) return; // Guarda de segurança
    setIsLoading(true);
    try {
      let imageUrl = selectedItem.image;
      if (updatedItemData.image && typeof updatedItemData.image === 'object') {
        imageUrl = await uploadImage(updatedItemData.image);
      }
      const finalCategory = updatedItemData.category === 'Outro' && updatedItemData.otherCategory ? updatedItemData.otherCategory : updatedItemData.category;

      const updateData: Partial<Product> = {
          name: updatedItemData.name,
          name_lowercase: updatedItemData.name.toLowerCase(),
          type: updatedItemData.materialType,
          code: updatedItemData.itemCode,
          patrimony: updatedItemData.materialType === 'permanente' ? updatedItemData.patrimony : 'N/A',
          unit: updatedItemData.unit,
          quantity: updatedItemData.quantity,
          category: finalCategory,
          reference: updatedItemData.reference,
          image: imageUrl,
          isPerishable: updatedItemData.isPerishable,
      };
      
      // ... (lógica de `changes` continua igual)
      const changes: string[] = [];
      // (seu código para popular `changes` aqui)
      
      if (changes.length > 0) {
        // 3. Passar secretariaId
        await addMovement(secretariaId, {
          productId: selectedItem.id,
          date: new Date().toISOString(),
          type: 'Auditoria',
          quantity: 0,
          responsible: user?.email || 'Desconhecido',
          changes: `Item editado: ${changes.join('; ')}.`,
          productType: updateData.type,
        });
      }
      
      // 3. Passar secretariaId
      await updateProduct(secretariaId, selectedItem.id, updateData);
      
      toast({ title: "Item Atualizado!", variant: "success" });
      fetchProducts(searchTerm, currentPage, pageCursors[currentPage - 1]);
    } catch(error: any) {
      toast({ title: "Erro ao Atualizar Item", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  // 4. Adicionar secretariaId como dependência
  }, [selectedItem, user, toast, searchTerm, currentPage, pageCursors, secretariaId]);

  const handleDeleteItem = React.useCallback(async (productId: string) => {
    if (!secretariaId) return; // Guarda de segurança
    setIsLoading(true);
    try {
      // 3. Passar secretariaId
      await deleteProduct(secretariaId, productId);
      toast({ title: "Item Excluído!", variant: "success" });
      refreshAndGoToFirstPage();
    } catch(error: any) {
      toast({ title: "Erro ao Excluir Item", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  // 4. Adicionar secretariaId como dependência
  }, [toast, secretariaId]);
  
  const handleReauthSuccess = () => {
    if (actionToConfirm) actionToConfirm();
    setIsReauthOpen(false);
    setActionToConfirm(null);
  };

  const handleExportInventory = async () => {
    if (!secretariaId) return; // Guarda de segurança
    setIsExporting(true);
    toast({ title: "Gerando relatório..." });

    try {
        // 3. Passar secretariaId
        const allProducts = await getAllProducts(secretariaId);

        if (allProducts.length === 0) {
            toast({ title: "Nenhum item para exportar", variant: "destructive" });
            return;
        }
        
        // 2. Reutiliza a lógica para calcular a data de validade mais próxima
        const productsWithExpiration = await Promise.all(allProducts.map(async product => {
            if (product.isPerishable === 'Sim') {
                const movements = await getMovementsForProducts(secretariaId, [product.id]);
                const entradas = movements.filter(m => m.type === 'Entrada' && m.expirationDate).sort((a, b) => parseISO(a.expirationDate!).getTime() - parseISO(b.expirationDate!).getTime());
                const saidas = movements.filter(m => m.type === 'Saída').reduce((sum, m) => sum + m.quantity, 0);

                let remainingSaidas = saidas;
                let earliestExpirationDate = undefined;
                for (const entrada of entradas) {
                    if (remainingSaidas < entrada.quantity) {
                        earliestExpirationDate = entrada.expirationDate;
                        break;
                    }
                    remainingSaidas -= entrada.quantity;
                }
                return { ...product, calculatedExpirationDate: earliestExpirationDate };
            }
            return { ...product, calculatedExpirationDate: undefined };
        }));


        // 3. Monta o CSV com a nova coluna
        const escapeCsvCell = (cellData: any) => {
            const stringData = String(cellData || "");
            if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
                return `"${stringData.replace(/"/g, '""')}"`;
            }
            return stringData;
        };
        
        // Adiciona a nova coluna "Validade Próxima"
        const headers = ["Código", "Nome", "Quantidade em Estoque", "Unidade", "Categoria", "Tipo", "Nº Patrimônio", "Referência", "Validade Próxima"];
        
        const rows = productsWithExpiration.map(p => [
            escapeCsvCell(p.code),
            escapeCsvCell(p.name),
            escapeCsvCell(p.quantity),
            escapeCsvCell(p.unit),
            escapeCsvCell(p.category),
            escapeCsvCell(p.type),
            escapeCsvCell(p.patrimony),
            escapeCsvCell(p.reference),
            // Formata a data de validade calculada ou deixa em branco
            escapeCsvCell(p.calculatedExpirationDate ? format(parseISO(p.calculatedExpirationDate), 'dd/MM/yyyy') : 'N/A')
        ].join(','));

        // 4. Gera e baixa o arquivo (sem alteração aqui)
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const fileName = `relatorio_inventario_com_validade_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({ title: "Relatório Gerado!", description: `O arquivo ${fileName} foi baixado.` });

    } catch (error) {
        console.error("Erro ao exportar inventário:", error);
        toast({ title: "Erro ao gerar relatório", description: "Não foi possível exportar os dados.", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };
  
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Inventário</h1>
                <p className="text-muted-foreground">
                    Consulte e gerencie todos os itens em estoque.
                </p>
            </div>
            { (userRole === 'Admin' || userRole === 'Operador') && (
              <>
                <Button variant="outline" onClick={handleExportInventory}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Exportar Qtd. Itens
                </Button>
                <Button onClick={() => setIsAddSheetOpen(true)} className="w-full sm:w-auto">
                    <PlusCircle className="mr-2" />
                    Adicionar Novo Item
                </Button>
              </>
            )}
        </div>

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar item por nome..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="hidden md:block border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Item</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                    <TableHead>Alerta</TableHead>
                    <TableHead className="text-right">Qtd. em Estoque</TableHead>
                    <TableHead className="w-[100px] text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center h-48">Carregando inventário...</TableCell></TableRow>
                  ) : products.length > 0 ? (
                    products.map((product) => {
                       const expirationStatus = product.isPerishable === 'Sim' && product.calculatedExpirationDate ? getExpirationStatus(product.calculatedExpirationDate) : null;
                       const alertIcon = getAlertIcon(expirationStatus);
                       const tooltipText = getTooltipText(expirationStatus, product.calculatedExpirationDate || '');
                       return (
                         <TableRow key={product.id}>
                           <TableCell>
                             <Image
                               src={product.image || "https://placehold.co/40x40.png"}
                               alt={product.name}
                               width={40}
                               height={40}
                               className="rounded-md object-cover aspect-square"
                             />
                           </TableCell>
                           <TableCell>
                             <div className="font-medium">{product.name}</div>
                             <div className="text-sm text-muted-foreground">Código: {product.code}</div>
                           </TableCell>
                           <TableCell className="hidden md:table-cell">
                             <Badge variant={product.type === 'permanente' ? 'secondary' : 'outline'}>{product.type}</Badge>
                           </TableCell>
                           <TableCell className="hidden lg:table-cell">{product.category}</TableCell>
                           <TableCell className="text-center">
                             {alertIcon && (
                               <Tooltip>
                                 <TooltipTrigger asChild><span className="cursor-pointer">{alertIcon}</span></TooltipTrigger>
                                 <TooltipContent><p>{tooltipText}</p></TooltipContent>
                               </Tooltip>
                             )}
                           </TableCell>
                           <TableCell className="text-right">
                             <div className="font-medium">{product.quantity}</div>
                             <div className="text-sm text-muted-foreground">{product.unit}</div>
                           </TableCell>
                           <TableCell className="text-center">
                                <DropdownMenu>
                                    { (userRole === 'Admin' || userRole === 'Operador') && (
                                        <DropdownMenuTrigger asChild>
                                            <Button aria-haspopup="true" size="icon" variant="ghost">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Toggle menu</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                    )}
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => { setSelectedItem(product); setIsMovementsSheetOpen(true); }}>
                                            <History className="mr-2 h-4 w-4" />
                                            <span>Ver Movimentações</span>
                                        </DropdownMenuItem>
                                        {userRole === 'Admin' && (
                                            <>
                                            <DropdownMenuItem onClick={() => {
                                                setActionToConfirm(() => () => {
                                                    setSelectedItem(product);
                                                    setIsEditSheetOpen(true);
                                                });
                                                setIsReauthOpen(true);
                                            }}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                <span>Editar Item</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem 
                                                className="text-red-600" 
                                                onClick={() => {
                                                    setActionToConfirm(() => () => handleDeleteItem(product.id));
                                                    setIsReauthOpen(true);
                                                }}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                <span>Excluir</span>
                                            </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                           </TableCell>
                         </TableRow>
                       );
                    })
                  ) : (
                    <TableRow><TableCell colSpan={7} className="text-center h-48">Nenhum produto encontrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {/* --- VISUALIZAÇÃO PARA MOBILE (CARDS) --- */}
            <div className="md:hidden space-y-4">
              {isLoading ? (
                <div className="text-center text-muted-foreground p-4">Carregando...</div>
              ) : products.length > 0 ? (
                products.map((product) => {
                  const expirationStatus = getExpirationStatus(product.calculatedExpirationDate);
                  const tooltipText = getTooltipText(expirationStatus, product.calculatedExpirationDate || '');
                  return (
                    <Card key={product.id}>
                      <CardHeader>
                        <div className="flex gap-4">
                          <Image
                            src={product.image || "https://placehold.co/64x64.png"}
                            alt={product.name}
                            width={64}
                            height={64}
                            className="rounded-md object-cover aspect-square"
                          />
                          <div className="flex-1">
                            <CardTitle className="text-base">{product.name}</CardTitle>
                            <CardDescription>Cód.: {product.code}</CardDescription>
                            <Sheet>
                              <SheetTrigger asChild>
                                  <Button aria-haspopup="true" size="icon" variant="ghost">
                                      <MoreHorizontal className="h-5 w-5" />
                                      <span className="sr-only">Toggle menu</span>
                                  </Button>
                              </SheetTrigger>
                              <SheetContent side="bottom">
                                  <SheetHeader className="mb-4">
                                      <SheetTitle>{product.name}</SheetTitle>
                                  </SheetHeader>
                                  <div className="flex flex-col gap-2">
                                      <Button variant="outline" className="justify-start" onClick={() => { setSelectedItem(product); setIsMovementsSheetOpen(true); }}>
                                          <History className="mr-2 h-4 w-4" />
                                          Ver Movimentações
                                      </Button>
                                      {userRole === 'Admin' && (
                                          <>
                                              <Button variant="outline" className="justify-start" onClick={() => {
                                                  setActionToConfirm(() => () => {
                                                      setSelectedItem(product);
                                                      setIsEditSheetOpen(true);
                                                  });
                                                  setIsReauthOpen(true);
                                              }}>
                                                  <Edit className="mr-2 h-4 w-4" />
                                                  Editar Item
                                              </Button>
                                              <Button variant="destructive" className="justify-start" onClick={() => {
                                                  setActionToConfirm(() => () => handleDeleteItem(product.id));
                                                  setIsReauthOpen(true);
                                              }}>
                                                  <Trash2 className="mr-2 h-4 w-4" />
                                                  Excluir Item
                                              </Button>
                                          </>
                                      )}
                                  </div>
                              </SheetContent>
                            </Sheet>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground space-y-2">
                        <div className="flex justify-between"><strong>Estoque:</strong> <span>{product.quantity} {product.unit}</span></div>
                        <div className="flex justify-between"><strong>Tipo:</strong> <Badge variant={product.type === 'permanente' ? 'secondary' : 'outline'}>{product.type}</Badge></div>
                        <div className="flex justify-between"><strong>Categoria:</strong> <span>{product.category}</span></div>
                      </CardContent>
                        
                      {expirationStatus && (
                        <CardFooter>
                           <Badge variant="destructive" className="w-full justify-center">{tooltipText}</Badge>
                        </CardFooter>
                      )}
                    </Card>
                  )
                })
              ) : (
                <div className="text-center text-muted-foreground p-4">Nenhum produto encontrado.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={handlePreviousPage} 
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="p-2 text-sm font-medium">Página {currentPage}</span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext 
                onClick={handleNextPage} 
                className={!hasNextPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
      
      <AddItemSheet 
        isOpen={isAddSheetOpen}
        onOpenChange={setIsAddSheetOpen}
        onItemAdded={handleAddItem}
      />
      {selectedItem && (
        <EditItemSheet
            isOpen={isEditSheetOpen}
            onOpenChange={setIsEditSheetOpen}
            onItemUpdated={handleUpdateItem}
            item={selectedItem}
        />
      )}
      {selectedItem && (
        <MovementsSheet
            isOpen={isMovementsSheetOpen}
            onOpenChange={setIsMovementsSheetOpen}
            item={selectedItem}
        />
      )}
      <ReauthDialog
        isOpen={isReauthOpen}
        onOpenChange={setIsReauthOpen}
        onSuccess={handleReauthSuccess}
      />
    </TooltipProvider>
  );
}
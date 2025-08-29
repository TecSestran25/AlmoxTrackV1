"use client";

import * as React from "react";
import { format, parseISO, differenceInMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Movement } from "@/lib/firestore";
import { getMovementsForItem } from "@/lib/firestore";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'Entrada':
        return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200';
      case 'Saída':
        return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
      case 'Devolução':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200';
      case 'Auditoria':
        return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200';
      default:
        return 'outline';
    }
  };

const getExpirationStatus = (expirationDate: string | undefined): 'alert' | 'warning' | 'reminder' | null => {
  if (!expirationDate) return null;
  const today = new Date();
  const expiresOn = parseISO(expirationDate);
  const monthsDifference = differenceInMonths(expiresOn, today);

  if (monthsDifference < 1) {
    return 'alert';
  } else if (monthsDifference < 2) {
    return 'warning';
  } else if (monthsDifference < 3) {
    return 'reminder';
  }
  return null;
};

const getTableRowClass = (status: 'alert' | 'warning' | 'reminder' | null, movementType: string) => {

    if (movementType !== 'Entrada') {
      return '';
    }

    switch(status) {
        case 'alert':
            return 'bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900';
        case 'warning':
            return 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950 dark:hover:bg-orange-900';
        case 'reminder':
            return 'bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950 dark:hover:bg-yellow-900';
        default:
            return '';
    }
};

interface MovementsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item: any; 
}

const extractRequesterInfo = (requesterString: string) => {
  const match = requesterString.match(/(.*)\s\((.*)\)/);
  if (match) {
    return { name: match[1], id: match[2] };
  }
  return { name: requesterString, id: '' };
};

export function MovementsSheet({ isOpen, onOpenChange, item }: MovementsSheetProps) {
  const [itemMovements, setItemMovements] = React.useState<Movement[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && item) {
      const fetchMovements = async () => {
        setIsLoading(true);
        const movements = await getMovementsForItem(item.id);

        const sortedMovements = movements.sort((a, b) => 
            parseISO(b.date).getTime() - parseISO(a.date).getTime()
        );
        setItemMovements(sortedMovements);
        setIsLoading(false);
      };
      fetchMovements();
    }
  }, [isOpen, item]);

  const processedMovements = React.useMemo(() => {
    if (itemMovements.length === 0) return [];

    const entradas = itemMovements
      .filter(m => m.type === 'Entrada' && m.expirationDate)
      .sort((a, b) => parseISO(a.expirationDate!).getTime() - parseISO(b.expirationDate!).getTime());

    let totalSaidas = itemMovements
      .filter(m => m.type === 'Saída')
      .reduce((sum, m) => sum + m.quantity, 0);

    const activeEntries = new Set<string>();
    for (const entrada of entradas) {
      if (totalSaidas > 0) {
        const remainingInBatch = entrada.quantity - totalSaidas;
        if (remainingInBatch > 0) {
          activeEntries.add(entrada.id);
          totalSaidas = 0;
        } else {
          totalSaidas -= entrada.quantity;
        }
      } else {
        activeEntries.add(entrada.id);
      }
    }

    return itemMovements.map(m => {
      const isEntrada = m.type === 'Entrada';
      const shouldAlert = isEntrada && activeEntries.has(m.id);
      const expirationStatus = shouldAlert ? getExpirationStatus(m.expirationDate) : null;
      const rowClassName = getTableRowClass(expirationStatus, m.type);
      return {
        ...m,
        rowClassName,
      };
    });
  }, [itemMovements]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico de Movimentações</SheetTitle>
          <SheetDescription>
            Veja o histórico completo de entradas, saídas e devoluções para o item <span className="font-semibold">{item?.name}</span>.
          </SheetDescription>
        </SheetHeader>
        <div className="py-6">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data e Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Operador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                     <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">Carregando...</TableCell>
                    </TableRow>
                  ) : processedMovements.length > 0 ? (
                    processedMovements.map((movement) => (
                          <TableRow key={movement.id} className={cn(movement.rowClassName, movement.type !== 'Entrada' && 'text-gray-400 dark:text-gray-600')}>
                            <TableCell>{format(parseISO(movement.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('font-normal', getBadgeVariant(movement.type))}>
                                  {movement.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                                {movement.expirationDate ? format(parseISO(movement.expirationDate), "dd/MM/yyyy") : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right font-medium">{movement.quantity}</TableCell>
                            <TableCell>
                                {movement.type === 'Saída' && movement.requester ? (
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {movement.responsible}
                                    </span>
                                    <div className="flex flex-col">
                                      <span className="text-muted-foreground text-xs">
                                        Solicitante: {extractRequesterInfo(movement.requester).name}
                                      </span>
                                      <span className="text-muted-foreground text-xs">
                                        Matrícula: {extractRequesterInfo(movement.requester).id}
                                      </span>
                                    </div>
                                  </div>
                                ) : movement.responsible.includes("Operador:") ? (
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {movement.responsible.split(" Operador:")[1]}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      {movement.responsible.split(" Operador:")[0]}
                                    </span>
                                  </div>
                                ) : (
                                  <span>{movement.responsible}</span>
                                )}
                            </TableCell>
                          </TableRow>
                        ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma movimentação encontrada para este item.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
        </div>
        <SheetFooter className="pt-4">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Fechar
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
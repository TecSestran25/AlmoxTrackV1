"use client";

import * as React from "react";
import Image from "next/image";
import { PlusCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/firestore";
import { searchProducts } from "@/lib/firestore";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext"; // Importar useAuth

interface ItemSearchProps {
  onSelectItem: (item: Product) => void;
  materialType?: 'consumo' | 'permanente';
  placeholder?: string;
  searchId: string;
  onRegisterNewItem?: () => void;
  // ADICIONADO: Propriedade para uma função de busca customizada
  searchFunction?: (searchTerm: string) => Promise<Product[]>;
}

export function ItemSearch({
  onSelectItem,
  materialType,
  placeholder,
  searchId,
  onRegisterNewItem,
  searchFunction // <-- Nova prop
}: ItemSearchProps) {
  const { secretariaId } = useAuth(); // <-- Obter secretariaId do contexto
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Product[]>([]);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [noResults, setNoResults] = React.useState(false);
  const { toast } = useToast();
  const searchRef = React.useRef<HTMLDivElement>(null);

  const fetchProducts = React.useCallback(async (term: string) => {
    if (!secretariaId || term.length < 2) { // <-- Adicionada verificação de secretariaId
      setSearchResults([]);
      setIsSearchOpen(false);
      setNoResults(false);
      return;
    }
    setIsLoading(true);
    setNoResults(false);
    try {
      // Usa a função de busca customizada se ela for fornecida,
      // caso contrário, usa a busca padrão.
      const productsFromDb = searchFunction
        ? await searchFunction(term)
        : await searchProducts(secretariaId, { searchTerm: term, materialType });

      setSearchResults(productsFromDb);
      setIsSearchOpen(true);
      if (productsFromDb.length === 0) {
        setNoResults(true);
      }
    } catch (error: any) { // <-- Erro tipado como any
      toast({
        title: "Erro ao Buscar Produtos",
        description: error.message || "Não foi possível buscar os produtos.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, materialType, secretariaId, searchFunction]); // <-- Adicionadas dependências

  React.useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts(searchTerm);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, fetchProducts]);

  const handleSelectItem = (item: Product) => {
    onSelectItem(item);
    setSearchTerm(""); // Limpa o campo de busca ao selecionar
    setSearchResults([]);
    setIsSearchOpen(false);
    setNoResults(false);
  };
  
  // ... (Restante do componente sem alterações)
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchRef]);

  return (
    <div className="flex-1 w-full relative" ref={searchRef}>
      <label htmlFor={searchId} className="text-sm font-medium">Buscar Item</label>
      <Input
        id={searchId}
        placeholder={placeholder || "Digite para buscar por nome ou código..."}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        autoComplete="off"
        className="mt-2"
      />
      {isSearchOpen && (
        <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
             <div className="p-2 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : searchResults.length > 0 ? (
              searchResults.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-2 cursor-pointer hover:bg-muted"
                  onClick={() => handleSelectItem(item)}
                >
                  <Image
                    src={item.image || "https://placehold.co/40x40.png"}
                    alt={item.name}
                    width={40}
                    height={40}
                    className="rounded-md object-cover aspect-square"
                  />
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.code}</div>
                  </div>
                </div>
              ))
          ) : noResults && onRegisterNewItem ? (
                <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Nenhum item encontrado.</p>
                    <Button variant="outline" onClick={onRegisterNewItem}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Cadastrar Novo Item
                    </Button>
                </div>
          ) : noResults ? (
                 <div className="p-2 text-center text-sm text-muted-foreground">Nenhum item encontrado.</div>
          ) : null }
        </div>
      )}
    </div>
  );
}
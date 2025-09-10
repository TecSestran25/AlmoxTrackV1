import { db } from './firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, runTransaction, increment, QueryConstraint, orderBy, limit, getDoc, startAfter, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { parseISO } from 'date-fns';

// --- INTERFACES (Estrutura de Dados) ---
// Suas interfaces já estavam corretas com a adição do secretariaId.

export interface UserData {
    name?: string;
    id?: string;
    department?: string;
    secretariaId: string;
}

export type Product = {
    id: string;
    secretariaId: string;
    image?: string;
    name: string;
    name_lowercase: string;
    code: string;
    patrimony: string;
    type: 'consumo' | 'permanente';
    quantity: number;
    unit: string;
    category: string;
    reference: string;
    expirationDate?: string;
    isPerishable?: 'Não' | 'Sim';
};

export type Movement = {
    id: string;
    secretariaId: string;
    productId: string;
    date: string;
    type: 'Entrada' | 'Saída' | 'Devolução' | "Auditoria";
    entryType?: 'Oficial' | 'Não Oficial';
    quantity: number;
    responsible: string;
    department?: string;
    supplier?: string;
    invoice?: string;
    productType?: 'consumo' | 'permanente';
    changes?: string;
    expirationDate?: string;
    requester?: string;
};

export type RequestItem = {
    type: string;
    id: string;
    secretariaId: string;
    name: string;
    quantity: number;
    unit: string;
    isPerishable?: 'Sim' | 'Não';
    expirationDate?: string;
};

export type RequestData = {
    id: string;
    secretariaId: string;
    items: RequestItem[];
    date: string;
    requester: string;
    department: string;
    purpose?: string;
    status: 'pending' | 'approved' | 'rejected';
    rejectionReason?: string;
    requestedByUid: string;
};

type EntryData = {
    items: { id: string; quantity: number; expirationDate?: string; }[];
    date: string;
    supplier: string;
    invoice?: string;
    responsible: string;
    entryType: 'Oficial' | 'Não Oficial';
}

type ExitData = {
    items: { id: string; quantity: number; expirationDate?: string, type?: boolean }[];
    date: string;
    requester: string;
    department: string;
    purpose?: string;
    responsible: string;
    expirationDate?: string;
}

type ReturnData = {
    items: { id: string; quantity: number }[];
    date: string;
    department: string;
    reason: string;
    responsible: string;
}

type MovementFilters = {
    startDate?: string;
    endDate?: string;
    movementType?: string;
    materialType?: string;
    department?: string;
};

type ProductFilters = {
    searchTerm?: string;
    materialType?: 'consumo' | 'permanente';
}

// --- COLEÇÕES ---
const productsCollection = collection(db, 'products');
const movementsCollection = collection(db, 'movements');
const requestsCollection = collection(db, 'requests');
const usersCollection = collection(db, "users");


// --- INTERFACES DE PAGINAÇÃO ---
export interface PaginatedProducts {
  products: Product[];
  lastDoc: DocumentSnapshot<DocumentData> | null;
}

export interface PaginatedRequests {
  requests: RequestData[];
  lastDoc: DocumentSnapshot<DocumentData> | null;
}


// --- FUNÇÕES DE ACESSO A DADOS (ADAPTADAS PARA MULTITENANCY) ---

/**
 * Busca dados de um usuário pelo UID.
 * A coleção de usuários é global, não precisa de filtro de secretaria.
 */
export const getUserData = async (uid: string): Promise<UserData | null> => {
    try {
        const userDocRef = doc(usersCollection, uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return userDoc.data() as UserData;
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
        return null;
    }
};

/**
 * Busca a função (role) de um usuário pelo UID.
 */
export const getUserRole = async (uid: string): Promise<string | null> => {
    try {
        const userDocRef = doc(usersCollection, uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return userDoc.data().role || null;
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar a função do utilizador:", error);
        return null;
    }
};

/**
 * Busca produtos de forma paginada para uma secretaria específica.
 */
export const getProducts = async (
    secretariaId: string,
    filters: ProductFilters = {},
    pageSize: number,
    cursor?: DocumentSnapshot<DocumentData>
): Promise<PaginatedProducts> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");

    const { searchTerm, materialType } = filters;
    const constraints: QueryConstraint[] = [
        where('secretariaId', '==', secretariaId), // Filtro principal de multitenancy
        orderBy('name_lowercase'),
        limit(pageSize)
    ];

    if (cursor) constraints.push(startAfter(cursor));
    if (materialType) constraints.push(where('type', '==', materialType));
    if (searchTerm && searchTerm.length > 0) {
        const lowercasedTerm = searchTerm.toLowerCase();
        constraints.push(where('name_lowercase', '>=', lowercasedTerm));
        constraints.push(where('name_lowercase', '<=', lowercasedTerm + '\uf8ff'));
    }

    const finalQuery = query(productsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    return { products, lastDoc };
};

/**
 * Busca TODOS os produtos de uma secretaria específica (para relatórios, etc.).
 */
export const getAllProducts = async (secretariaId: string, filters: ProductFilters = {}): Promise<Product[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const { materialType } = filters;
    const constraints: QueryConstraint[] = [
        where('secretariaId', '==', secretariaId),
        orderBy('name_lowercase')
    ];

    if (materialType) constraints.push(where('type', '==', materialType));

    const finalQuery = query(productsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
};

/**
 * Busca requisições de um usuário específico dentro de uma secretaria.
 */
export const getRequestsForUser = async (
    secretariaId: string,
    uid: string,
    pageSize: number,
    cursor?: DocumentSnapshot<DocumentData>
): Promise<PaginatedRequests> => {
    if (!secretariaId || !uid) return { requests: [], lastDoc: null };

    const constraints: QueryConstraint[] = [
        where('secretariaId', '==', secretariaId),
        where('requestedByUid', '==', uid),
        orderBy('date', 'desc'),
        limit(pageSize)
    ];

    if (cursor) constraints.push(startAfter(cursor));

    const finalQuery = query(requestsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    return { requests, lastDoc };
};

/**
 * Busca um produto específico pelo ID e verifica se ele pertence à secretaria.
 */
export const getProductById = async (secretariaId: string, productId: string): Promise<Product | null> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const productRef = doc(productsCollection, productId);
    const docSnap = await getDoc(productRef);

    if (docSnap.exists() && docSnap.data().secretariaId === secretariaId) {
        return { ...docSnap.data(), id: docSnap.id } as Product;
    }
    
    console.warn(`Produto ${productId} não encontrado ou não pertence à secretaria ${secretariaId}.`);
    return null;
};

/**
 * Busca produtos por nome ou código dentro de uma secretaria.
 */
export const searchProducts = async (secretariaId: string, filters: ProductFilters = {}): Promise<Product[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const { searchTerm, materialType } = filters;
    const constraints: QueryConstraint[] = [where('secretariaId', '==', secretariaId)];

    if (materialType) constraints.push(where('type', '==', materialType));
    if (!searchTerm || searchTerm.length < 2) return [];

    const lowercasedTerm = searchTerm.toLowerCase();

    const nameQuery = query(productsCollection,
        ...constraints,
        orderBy('name_lowercase'),
        where('name_lowercase', '>=', lowercasedTerm),
        where('name_lowercase', '<=', lowercasedTerm + '\uf8ff'),
        limit(10)
    );
    const codeQuery = query(productsCollection,
        ...constraints,
        where('code', '==', searchTerm),
        limit(10)
    );

    const [nameSnapshot, codeSnapshot] = await Promise.all([getDocs(nameQuery), getDocs(codeQuery)]);
    const productsMap = new Map<string, Product>();
    nameSnapshot.docs.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() } as Product));
    codeSnapshot.docs.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() } as Product));

    return Array.from(productsMap.values());
};

/**
 * Adiciona um novo produto, associando-o à secretaria.
 */
export const addProduct = async (secretariaId: string, productData: Omit<Product, 'id' | 'secretariaId'>): Promise<string> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const dataWithTenant = { ...productData, secretariaId };
    const docRef = await addDoc(productsCollection, dataWithTenant);
    return docRef.id;
};

/**
 * Atualiza um produto após verificar se ele pertence à secretaria.
 */
export const updateProduct = async (secretariaId: string, productId: string, productData: Partial<Product>): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const productDocRef = doc(productsCollection, productId);
    const productDoc = await getDoc(productDocRef);

    if (!productDoc.exists() || productDoc.data().secretariaId !== secretariaId) {
        throw new Error("Produto não encontrado ou você não tem permissão para editá-lo.");
    }

    await updateDoc(productDocRef, productData);
};

/**
 * Deleta um produto após verificar se ele pertence à secretaria.
 */
export const deleteProduct = async (secretariaId: string, productId: string): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const productDocRef = doc(productsCollection, productId);
    const productDoc = await getDoc(productDocRef);
    
    if (!productDoc.exists() || productDoc.data().secretariaId !== secretariaId) {
        throw new Error("Produto não encontrado ou você não tem permissão para deletá-lo.");
    }
    
    await deleteDoc(productDocRef);
};


export type ImageObject = {
    base64: string;
    fileName: string;
    contentType: string;
};

/**
 * Faz upload de uma imagem. Não interage diretamente com coleções tenant-based.
 */
export const uploadImage = async (imageObject: ImageObject): Promise<string> => {
    if (!imageObject || !imageObject.base64) {
        return "https://placehold.co/40x40.png";
    }
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                base64: imageObject.base64,
                fileName: imageObject.fileName,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Falha no upload da imagem.');
        }
        const { url } = await response.json();
        return url;
    } catch (error) {
        console.error("Erro no upload da imagem via API:", error);
        throw error;
    }
};

/**
 * Gera o próximo código de item sequencial dentro de uma secretaria.
 */
export const generateNextItemCode = async (secretariaId: string, prefix: string): Promise<string> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const q = query(
        productsCollection,
        where('secretariaId', '==', secretariaId),
        where('code', '>=', prefix),
        where('code', '<=', prefix + '\uf8ff'),
        orderBy('code', 'desc'),
        limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return `${prefix}-001`;
    } else {
        const lastCode = querySnapshot.docs[0].data().code;
        const lastNumber = parseInt(lastCode.split('-').pop() || '0', 10);
        const nextNumber = lastNumber + 1;
        const formattedNextNumber = nextNumber.toString().padStart(3, '0');
        return `${prefix}-${formattedNextNumber}`;
    }
};

// --- TRANSAÇÕES (MOVIMENTAÇÕES DE ESTOQUE) ---

/**
 * Finaliza uma transação de ENTRADA de itens no estoque.
 */
export const finalizeEntry = async (secretariaId: string, entryData: EntryData): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = entryData.items.map(item => doc(productsCollection, item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

            // Valida todos os documentos antes de prosseguir
            for (let i = 0; i < productDocs.length; i++) {
                const productDoc = productDocs[i];
                if (!productDoc.exists() || productDoc.data().secretariaId !== secretariaId) {
                    throw new Error(`Produto com ID ${entryData.items[i].id} não encontrado ou inválido.`);
                }
            }

            // Executa as atualizações
            for (let i = 0; i < entryData.items.length; i++) {
                const item = entryData.items[i];
                const productDoc = productDocs[i];
                // CORREÇÃO APLICADA AQUI
                const productData = productDoc.data() as Product; 

                const productUpdateData: { quantity: any; expirationDate?: string; } = {
                    quantity: increment(item.quantity)
                };

                if (productData.isPerishable === 'Sim' && item.expirationDate) {
                    const currentExpirationDate = productData.expirationDate;
                    if (!currentExpirationDate || new Date(item.expirationDate) < new Date(currentExpirationDate)) {
                        productUpdateData.expirationDate = item.expirationDate;
                    }
                }
                
                transaction.update(productRefs[i], productUpdateData);
                
                const movementData: Omit<Movement, 'id'> = {
                    secretariaId,
                    productId: item.id,
                    date: entryData.date,
                    type: 'Entrada',
                    quantity: item.quantity,
                    responsible: entryData.responsible,
                    supplier: entryData.supplier,
                    entryType: entryData.entryType,
                    productType: productData.type, // CORREÇÃO APLICADA AQUI
                    expirationDate: item.expirationDate || "",
                    invoice: entryData.invoice || "",
                };
                
                const movementRef = doc(movementsCollection);
                transaction.set(movementRef, movementData);
            }
        });
    } catch (e) {
        console.error("Transação de entrada falhou: ", e);
        throw e;
    }
};

/**
 * Finaliza uma transação de SAÍDA de itens do estoque.
 */
export const finalizeExit = async (secretariaId: string, exitData: ExitData, requestId?: string): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = exitData.items.map(item => doc(productsCollection, item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

            for (let i = 0; i < productDocs.length; i++) {
                const productDoc = productDocs[i];
                const item = exitData.items[i];
                if (!productDoc.exists() || productDoc.data().secretariaId !== secretariaId) {
                    throw new Error(`Produto com ID ${item.id} não encontrado ou inválido.`);
                }
                if (productDoc.data().quantity < item.quantity) {
                    throw new Error(`Estoque insuficiente para ${productDoc.data().name}.`);
                }
            }

            for (let i = 0; i < exitData.items.length; i++) {
                const item = exitData.items[i];
                // CORREÇÃO APLICADA AQUI
                const productData = productDocs[i].data() as Product;

                transaction.update(productRefs[i], { quantity: increment(-item.quantity) });

                const movementData: Omit<Movement, 'id'> = {
                    secretariaId,
                    productId: item.id,
                    date: exitData.date,
                    type: 'Saída',
                    quantity: item.quantity,
                    responsible: exitData.responsible,
                    department: exitData.department,
                    productType: productData.type, // CORREÇÃO APLICADA AQUI
                    expirationDate: item.expirationDate || "",
                    requester: exitData.requester
                };
                
                const movementRef = doc(movementsCollection);
                transaction.set(movementRef, movementData);
            }

            if (requestId) {
                const requestRef = doc(requestsCollection, requestId);
                const requestDoc = await transaction.get(requestRef);
                if (!requestDoc.exists() || requestDoc.data().secretariaId !== secretariaId) {
                   throw new Error("Requisição não encontrada ou inválida.");
                }
                transaction.update(requestRef, {
                    status: 'approved',
                    approvalDate: new Date().toISOString(),
                    approvedBy: exitData.responsible
                });
            }
        });
        
        for (const item of exitData.items) {
            await findAndSetNewExpirationDate(secretariaId, item.id);
        }

    } catch (e) {
        console.error("Transação de saída falhou: ", e);
        throw e;
    }
};

/**
 * Finaliza uma transação de DEVOLUÇÃO de itens para o estoque.
 */
export const finalizeReturn = async (secretariaId: string, returnData: ReturnData): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = returnData.items.map(item => doc(productsCollection, item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

            for (const productDoc of productDocs) {
                if (!productDoc.exists() || productDoc.data().secretariaId !== secretariaId) {
                    throw new Error(`Um dos produtos não foi encontrado ou é inválido.`);
                }
            }

            for (let i = 0; i < returnData.items.length; i++) {
                const item = returnData.items[i];
                // CORREÇÃO APLICADA AQUI
                const productData = productDocs[i].data() as Product;
                
                transaction.update(productRefs[i], { quantity: increment(item.quantity) });

                const movementData: Omit<Movement, 'id'> = {
                    secretariaId,
                    productId: item.id,
                    date: returnData.date,
                    type: 'Devolução',
                    quantity: item.quantity,
                    responsible: returnData.responsible,
                    department: returnData.department,
                    productType: productData.type, // CORREÇÃO APLICADA AQUI
                };

                const movementRef = doc(movementsCollection);
                transaction.set(movementRef, movementData);
            }
        });
        
        for (const item of returnData.items) {
            await findAndSetNewExpirationDate(secretariaId, item.id);
        }

    } catch (e) {
        console.error("Transação de devolução falhou: ", e);
        throw e;
    }
};

/**
 * Função auxiliar para encontrar e definir a nova data de expiração de um produto.
 */
const findAndSetNewExpirationDate = async (secretariaId: string, productId: string) => {
    const q = query(movementsCollection, where('secretariaId', '==', secretariaId), where('productId', '==', productId));
    const snapshot = await getDocs(q);
    const allMovements = snapshot.docs.map(doc => doc.data() as Movement);

    const entradas = allMovements
        .filter(m => m.type === 'Entrada' && m.expirationDate)
        .sort((a, b) => parseISO(a.expirationDate!).getTime() - parseISO(b.expirationDate!).getTime());
    
    const totalSaidas = allMovements
        .filter(m => m.type === 'Saída')
        .reduce((sum, m) => sum + m.quantity, 0);
    
    let newExpirationDate = "";
    let remainingSaidas = totalSaidas;

    for (const entrada of entradas) {
        if (entrada.expirationDate) {
            if (remainingSaidas < entrada.quantity) {
                newExpirationDate = entrada.expirationDate;
                break;
            }
            remainingSaidas -= entrada.quantity;
        }
    }
    
    // Chama a função de update segura
    await updateProduct(secretariaId, productId, { expirationDate: newExpirationDate || "" });
};

// --- FUNÇÕES DE CONSULTA DE MOVIMENTOS E REQUISIÇÕES ---

/**
 * Busca todas as movimentações para uma lista de produtos de uma secretaria.
 */
export const getMovementsForProducts = async (secretariaId: string, productIds: string[]): Promise<Movement[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    if (!productIds || productIds.length === 0) return [];

    const q = query(movementsCollection, where('secretariaId', '==', secretariaId), where('productId', 'in', productIds));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
};

/**
 * Busca movimentações com base em filtros para uma secretaria.
 */
export const getMovements = async (secretariaId: string, filters: MovementFilters = {}): Promise<Movement[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const { startDate, endDate, movementType, materialType, department } = filters;
    let constraints: QueryConstraint[] = [where('secretariaId', '==', secretariaId)];

    if (startDate) constraints.push(where('date', '>=', startDate));
    if (endDate) {
        const toDate = new Date(parseISO(endDate));
        toDate.setHours(23, 59, 59, 999);
        constraints.push(where('date', '<=', toDate.toISOString()));
    }
    if (movementType && movementType !== 'all') constraints.push(where('type', '==', movementType));
    if (department && department !== 'all') constraints.push(where('department', '==', department));
    if (materialType && materialType !== 'all') constraints.push(where('productType', '==', materialType));
    
    constraints.push(orderBy('date', 'desc'));

    const finalQuery = query(movementsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
};

/**
 * Busca todas as movimentações de um item específico em uma secretaria.
 */
export const getMovementsForItem = async (secretariaId: string, productId: string): Promise<Movement[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const q = query(movementsCollection, where('secretariaId', '==', secretariaId), where('productId', '==', productId), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
}

/**
 * Adiciona um registro de movimento avulso (ex: auditoria).
 */
export const addMovement = async (secretariaId: string, movementData: Omit<Movement, 'id' | 'secretariaId'>): Promise<string> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const dataWithTenant = { ...movementData, secretariaId };
    const docRef = await addDoc(movementsCollection, dataWithTenant);
    return docRef.id;
};

/**
 * Busca todas as requisições pendentes de uma secretaria.
 */
export const getPendingRequests = async (secretariaId: string): Promise<RequestData[]> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const q = query(requestsCollection, where('secretariaId', '==', secretariaId), where('status', '==', 'pending'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
};

/**
 * Rejeita uma requisição após verificar se ela pertence à secretaria.
 */
export const rejectRequest = async (secretariaId: string, requestId: string, responsible: string, reason: string): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const requestRef = doc(requestsCollection, requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists() || requestDoc.data().secretariaId !== secretariaId) {
        throw new Error("Requisição não encontrada ou você não tem permissão para rejeitá-la.");
    }
    
    await updateDoc(requestRef, {
        status: 'rejected',
        rejectedBy: responsible,
        rejectionDate: new Date().toISOString(),
        rejectionReason: reason
    });
};

/**
 * Cria uma nova requisição, associando-a à secretaria.
 */
export const createRequest = async (secretariaId: string, requestData: Omit<RequestData, 'id' | 'status' | 'secretariaId'>): Promise<string> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const dataWithTenant = { ...requestData, secretariaId, status: 'pending' as const };
    const docRef = await addDoc(requestsCollection, dataWithTenant);
    return docRef.id;
};

/**
 * Deleta uma requisição após verificar se pertence ao usuário e à secretaria.
 */
export const deleteRequest = async (secretariaId: string, requestId: string, userId: string): Promise<void> => {
    if (!secretariaId) throw new Error("ID da secretaria é obrigatório.");
    const requestRef = doc(requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists() || 
        requestSnap.data().requestedByUid !== userId ||
        requestSnap.data().secretariaId !== secretariaId) {
        throw new Error("Você não tem permissão para cancelar esta requisição.");
    }

    if (requestSnap.data().status !== 'pending') {
        throw new Error("Não é possível cancelar uma requisição que já foi processada.");
    }

    await deleteDoc(requestRef);
};
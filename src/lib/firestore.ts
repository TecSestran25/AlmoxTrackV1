import { db } from './firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, runTransaction, increment, QueryConstraint, orderBy, limit, getDoc, startAfter, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { parseISO } from 'date-fns';

export interface UserData {
    name?: string;
    id?: string;
    department?: string;
}

export type Product = {
    id: string;
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
    name: string;
    quantity: number;
    unit: string;
    isPerishable?: 'Sim' | 'Não';
    expirationDate?: string;
};

export type RequestData = {
    id: string;
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

const productsCollection = collection(db, 'products');
const movementsCollection = collection(db, 'movements');
const requestsCollection = collection(db, 'requests');

export interface PaginatedProducts {
  products: Product[];
  lastDoc: DocumentSnapshot<DocumentData> | null;
}

export const getUserData = async (uid: string): Promise<UserData | null> => {
    try {
        const userDocRef = doc(db, "users", uid);
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

export const getUserRole = async (uid: string): Promise<string | null> => {
    try {
      const userDocRef = doc(db, "users", uid);
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

export const getProducts = async (
  filters: ProductFilters = {}, 
  pageSize: number, 
  cursor?: DocumentSnapshot<DocumentData>
): Promise<PaginatedProducts> => {
  const { searchTerm, materialType } = filters;
  
  const constraints: QueryConstraint[] = [
    orderBy('name_lowercase'),
    limit(pageSize)
  ];

  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  
  if (materialType) {
    constraints.push(where('type', '==', materialType));
  }

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

export const getAllProducts = async (filters: ProductFilters = {}): Promise<Product[]> => {
  const { materialType } = filters;
  const constraints: QueryConstraint[] = [orderBy('name_lowercase')];

  if (materialType) {
    constraints.push(where('type', '==', materialType));
  }
  
  const finalQuery = query(productsCollection, ...constraints);
  const snapshot = await getDocs(finalQuery);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
};

export interface PaginatedRequests {
  requests: RequestData[];
  lastDoc: DocumentSnapshot<DocumentData> | null;
}

// Substitua a função getRequestsForUser existente por esta
export const getRequestsForUser = async (
  uid: string, 
  pageSize: number, 
  cursor?: DocumentSnapshot<DocumentData>
): Promise<PaginatedRequests> => {
  if (!uid) {
    return { requests: [], lastDoc: null };
  }
  
  const requestsCollection = collection(db, 'requests');
  
  const constraints: QueryConstraint[] = [
    where('requestedByUid', '==', uid),
    orderBy('date', 'desc'),
    limit(pageSize)
  ];

  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  
  const finalQuery = query(requestsCollection, ...constraints);
  const snapshot = await getDocs(finalQuery);

  const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
  const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { requests, lastDoc };
};

export const getProductById = async (productId: string): Promise<Product | null> => {
    try {
        const productRef = doc(db, "products", productId);
        const docSnap = await getDoc(productRef);

        if (docSnap.exists()) {
            // Retorna os dados do documento junto com seu ID
            return { ...docSnap.data(), id: docSnap.id } as Product;
        } else {
            console.warn(`Produto com ID ${productId} não encontrado.`);
            return null;
        }
    } catch (error) {
        console.error("Erro ao buscar produto por ID:", error);
        throw error;
    }
};

export const searchProducts = async (filters: ProductFilters = {}): Promise<Product[]> => {
  const { searchTerm, materialType } = filters;
  const constraints: QueryConstraint[] = [];

  if (materialType) {
    constraints.push(where('type', '==', materialType));
  }

  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

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

  const [nameSnapshot, codeSnapshot] = await Promise.all([
    getDocs(nameQuery),
    getDocs(codeQuery)
  ]);

  const productsMap = new Map<string, Product>();
  nameSnapshot.docs.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() } as Product));
  codeSnapshot.docs.forEach(doc => productsMap.set(doc.id, { id: doc.id, ...doc.data() } as Product));

  return Array.from(productsMap.values());
};


export const addProduct = async (productData: Omit<Product, 'id'>): Promise<string> => {
    const docRef = await addDoc(productsCollection, productData);
    return docRef.id;
};

export const updateProduct = async (productId: string, productData: Partial<Product>): Promise<void> => {
    const productDoc = doc(db, 'products', productId);
    await updateDoc(productDoc, productData);
};

export const deleteProduct = async (productId: string): Promise<void> => {
    const productDoc = doc(db, 'products', productId);
    await deleteDoc(productDoc);
};

export type ImageObject = {
    base64: string;
    fileName: string;
    contentType: string;
};

export const uploadImage = async (imageObject: ImageObject): Promise<string> => {
  if (!imageObject || !imageObject.base64) {
    return "https://placehold.co/40x40.png"; // Retorna um placeholder se não houver imagem
  }
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64: imageObject.base64,
        fileName: imageObject.fileName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Falha no upload da imagem para o servidor.');
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error("Erro ao fazer upload da imagem via API:", error);
    // Em caso de falha, você pode optar por retornar um placeholder ou lançar o erro
    throw error;
  }
};

export const generateNextItemCode = async (prefix: string): Promise<string> => {
    const q = query(
      productsCollection,
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

export const finalizeEntry = async (entryData: EntryData): Promise<void> => {
    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = entryData.items.map(item => doc(db, "products", item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

            const productUpdates = new Map();
            const movementEntries = [];

            for (let i = 0; i < entryData.items.length; i++) {
                const item = entryData.items[i];
                const productDoc = productDocs[i];

                if (!productDoc.exists()) {
                    throw new Error(`Produto com ID ${item.id} não encontrado.`);
                }
                
                const productUpdateData: { quantity: any; expirationDate?: string; } = {
                    quantity: increment(item.quantity)
                };

                if (productDoc.data().isPerishable === 'Sim' && item.expirationDate) {
                    const currentExpirationDate = productDoc.data().expirationDate;
                    if (!currentExpirationDate || new Date(item.expirationDate) < new Date(currentExpirationDate)) {
                        productUpdateData.expirationDate = item.expirationDate;
                    }
                }
                productUpdates.set(productRefs[i], productUpdateData);

                const movementData: Omit<Movement, 'id'> = {
                    productId: item.id,
                    date: entryData.date,
                    type: 'Entrada',
                    quantity: item.quantity,
                    responsible: entryData.responsible,
                    supplier: entryData.supplier,
                    entryType: entryData.entryType,
                    productType: productDoc.data().type,
                    expirationDate: item.expirationDate || "",
                };

                if (entryData.invoice) {
                    movementData.invoice = entryData.invoice;
                }
                movementEntries.push(movementData);
            }

            for (const [ref, data] of productUpdates.entries()) {
                transaction.update(ref, data);
            }
            for (const data of movementEntries) {
                const movementRef = doc(collection(db, "movements"));
                transaction.set(movementRef, data);
            }
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
};

const findAndSetNewExpirationDate = async (productId: string) => {
    const q = query(
        movementsCollection,
        where('productId', '==', productId)
    );
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
    await updateProduct(productId, { expirationDate: newExpirationDate || "" });
};

export const finalizeExit = async (exitData: ExitData, requestId?: string): Promise<void> => {
    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = exitData.items.map(item => doc(db, "products", item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

            const productUpdates = new Map();
            const movementExits = [];

            // Esta parte continua a mesma: prepara as atualizações de estoque e movimentações
            for (let i = 0; i < exitData.items.length; i++) {
                const item = exitData.items[i];
                const productDoc = productDocs[i];

                if (!productDoc.exists()) {
                    throw new Error(`Produto com ID ${item.id} não encontrado.`);
                }
                
                const currentQuantity = productDoc.data().quantity;
                if (currentQuantity < item.quantity) {
                    throw new Error(`Estoque insuficiente para ${productDoc.data().name}.`);
                }

                productUpdates.set(productRefs[i], { quantity: increment(-item.quantity) });

                const movementData: Omit<Movement, 'id'> = {
                    productId: item.id,
                    date: exitData.date,
                    type: 'Saída',
                    quantity: item.quantity,
                    responsible: exitData.responsible,
                    department: exitData.department,
                    productType: productDoc.data().type,
                    expirationDate: item.expirationDate || "",
                    requester: exitData.requester
                };
                movementExits.push(movementData);
            }
            
            // Aplica as atualizações de estoque
            for (const [ref, data] of productUpdates.entries()) {
                transaction.update(ref, data);
            }

            // Cria os novos documentos de movimentação
            for (const data of movementExits) {
                const movementRef = doc(collection(db, "movements"));
                transaction.set(movementRef, data);
            }

            // -----------------------------------------------------------------
            // 👇 NOVA LÓGICA ADICIONADA: Atualiza o status da requisição original 👇
            // -----------------------------------------------------------------
            if (requestId) {
                const requestRef = doc(db, "requests", requestId);
                transaction.update(requestRef, {
                    status: 'approved',
                    approvalDate: new Date().toISOString(),
                    approvedBy: exitData.responsible 
                });
            }
        });
        
        // Esta parte, que fica FORA da transação, continua a mesma
        for (const item of exitData.items) {
            await findAndSetNewExpirationDate(item.id);
        }

    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
};

export const finalizeReturn = async (returnData: ReturnData): Promise<void> => {
      try {
        await runTransaction(db, async (transaction) => {
            const productRefs = returnData.items.map(item => doc(db, "products", item.id));
            const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
            
            const productUpdates = new Map();
            const movementReturns = [];

            for (let i = 0; i < returnData.items.length; i++) {
                const item = returnData.items[i];
                const productDoc = productDocs[i];
                 if (!productDoc.exists()) {
                    throw new Error(`Produto com ID ${item.id} não encontrado.`);
                }
                
                productUpdates.set(productRefs[i], { quantity: increment(item.quantity) });

                const movementData: Omit<Movement, 'id'> = {
                    productId: item.id,
                    date: returnData.date,
                    type: 'Devolução',
                    quantity: item.quantity,
                    responsible: returnData.responsible,
                    department: returnData.department,
                    productType: productDoc.data().type,
                };
                movementReturns.push(movementData);
            }

            for (const [ref, data] of productUpdates.entries()) {
                transaction.update(ref, data);
            }
            for (const data of movementReturns) {
                const movementRef = doc(collection(db, "movements"));
                transaction.set(movementRef, data);
            }
        });
        
        for (const item of returnData.items) {
            await findAndSetNewExpirationDate(item.id);
        }

    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
};

export const getMovementsForProducts = async (productIds: string[]): Promise<Movement[]> => {
  if (!productIds || productIds.length === 0) {
    return [];
  }
  
  const movementsCollection = collection(db, 'movements');
  const q = query(movementsCollection, where('productId', 'in', productIds));
  
  const querySnapshot = await getDocs(q);
  
  const movements: Movement[] = [];
  querySnapshot.forEach(doc => {
    movements.push({ id: doc.id, ...doc.data() } as Movement);
  });
  
  return movements;
};

export const getMovements = async (filters: MovementFilters = {}): Promise<Movement[]> => {
    const { startDate, endDate, movementType, materialType, department } = filters;
    const movementsCollection = collection(db, 'movements');
    let constraints: QueryConstraint[] = [];

    if (startDate) { constraints.push(where('date', '>=', startDate)); }
    if (endDate) {
        const toDate = new Date(parseISO(endDate));
        toDate.setHours(23, 59, 59, 999);
        constraints.push(where('date', '<=', toDate.toISOString()));
    }
    if (movementType && movementType !== 'all') { constraints.push(where('type', '==', movementType)); }
    if (department && department !== 'all') { constraints.push(where('department', '==', department)); }
    
    if (materialType && materialType !== 'all') {
        constraints.push(where('productType', '==', materialType));
    }
    
    constraints.push(orderBy('date', 'desc'));

    const finalQuery = query(movementsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
};

export const getMovementsForItem = async (productId: string): Promise<Movement[]> => {
    const q = query(movementsCollection, where('productId', '==', productId), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
}

export const addMovement = async (movementData: Omit<Movement, 'id'>): Promise<string> => {
    const docRef = await addDoc(movementsCollection, movementData);
    return docRef.id;
};
export const getPendingRequests = async (): Promise<RequestData[]> => {
    const q = query(requestsCollection, where('status', '==', 'pending'), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RequestData));
};

export const rejectRequest = async (requestId: string, responsible: string, reason: string): Promise<void> => {
  const requestRef = doc(db, 'requests', requestId);
  await updateDoc(requestRef, { 
      status: 'rejected',
      rejectedBy: responsible,
      rejectionDate: new Date().toISOString(),
      rejectionReason: reason
  });
};

export const createRequest = async (requestData: Omit<RequestData, 'id' | 'status'>): Promise<string> => {
    const docRef = await addDoc(requestsCollection, { ...requestData, status: 'pending' });
    return docRef.id;
};

export const deleteRequest = async (requestId: string, userId: string): Promise<void> => {
    const requestRef = doc(db, "requests", requestId);

    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists() || requestSnap.data().requestedByUid !== userId) {
        throw new Error("Você não tem permissão para cancelar esta requisição.");
    }

    if (requestSnap.data().status !== 'pending') {
        throw new Error("Não é possível cancelar uma requisição que já foi processada.");
    }

    await deleteDoc(requestRef);
};
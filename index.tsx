
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';

// --- INTERFaces AND TYPES ---
interface ShopifyVariant {
  id: number | string;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  available: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  published_at: string | null;
  tags: string[] | string; // Admin API returns string, Storefront returns array
  variants: ShopifyVariant[];
  images: { src: string }[];
}

type UserRole = 'admin' | 'user';

interface User {
  email: string; // Will now hold Employee ID
  passwordHash: string;
  role: UserRole;
}

type Page = 'login' | 'app' | 'admin';
type StoreType = 'shopify' | 'prestashop' | 'tiendanube';
type ShopifyMethod = 'public' | 'private';

// --- COMPONENTS ---

// Extractor Component
const ExtractorPage: React.FC<{ user: User, onNavigate: (page: Page) => void, onLogout: () => void }> = ({ user, onNavigate, onLogout }) => {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [tiendaNubeUserId, setTiendaNubeUserId] = useState('');
  const [tiendaNubeToken, setTiendaNubeToken] = useState('');
  const [storeType, setStoreType] = useState<StoreType>('shopify');
  const [shopifyMethod, setShopifyMethod] = useState<ShopifyMethod>('public');
  const [shopifyStoreName, setShopifyStoreName] = useState('');
  const [shopifyApiToken, setShopifyApiToken] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);

  const fetchWithCors = (url: string, options?: RequestInit) => {
    const proxyUrl = 'https://corsproxy.io/?';
    return fetch(`${proxyUrl}${encodeURIComponent(url)}`, options);
  }
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const extractShopifyProductsPublic = async (rawUrl: string): Promise<ShopifyProduct[]> => {
    let storeUrl = new URL(rawUrl.trim());
    storeUrl = new URL(storeUrl.origin);

    let allProducts: ShopifyProduct[] = [];
    let page = 1;
    const limit = 250;

    while (true) {
      setLoadingMessage(`Extrayendo productos de Shopify (Público)... página ${page}`);
      const productsJsonUrl = `${storeUrl.href}/products.json?limit=${limit}&page=${page}`;
      const response = await fetch(productsJsonUrl); // No CORS needed for public .json
      if (!response.ok) throw new Error('No se pudo acceder a los productos. Asegúrate de que la URL es correcta y es una tienda Shopify.');
      
      const data = await response.json();
      if (data.products && data.products.length > 0) {
        allProducts = allProducts.concat(data.products);
        setLoadingMessage(`Encontrados ${allProducts.length} productos...`);
        page++;
      } else {
        break;
      }
    }
    return allProducts;
  };
  
  const extractShopifyProductsPrivate = async (storeName: string, apiToken: string): Promise<ShopifyProduct[]> => {
    const apiVersion = '2024-04'; // A recent, stable API version
    const apiEndpoint = `https://${storeName}.myshopify.com/admin/api/${apiVersion}/products.json`;
    let allProducts: ShopifyProduct[] = [];
    let nextUrl: string | null = `${apiEndpoint}?limit=250`;

    while (nextUrl) {
        setLoadingMessage(`Extrayendo productos de Shopify (API Privada)...`);
        const response = await fetchWithCors(nextUrl, {
            headers: { 'X-Shopify-Access-Token': apiToken },
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw new Error('Acceso no autorizado. Revisa el nombre de la tienda y el Token de Acceso.');
            throw new Error('No se pudo conectar a la API de Shopify. Revisa los datos y que la App privada tenga permisos de lectura de productos.');
        }

        const data = await response.json();
        if (data.products && data.products.length > 0) {
            allProducts = allProducts.concat(data.products);
            setLoadingMessage(`Encontrados ${allProducts.length} productos...`);
        }

        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
            const links = linkHeader.split(', ');
            const nextLink = links.find(link => link.includes('rel="next"'));
            if (nextLink) {
                const urlMatch = nextLink.match(/<(.*?)>/);
                nextUrl = urlMatch ? urlMatch[1] : null;
            } else {
                nextUrl = null;
            }
        } else {
            nextUrl = null;
        }
    }
    return allProducts;
};


  const extractPrestaShopProducts = async (rawUrl: string, key: string): Promise<ShopifyProduct[]> => {
      let storeUrl = new URL(rawUrl.trim());
      const storeOrigin = storeUrl.origin;
      const apiEndpoint = `${storeOrigin}/api`;

      setLoadingMessage('Obteniendo lista de productos de PrestaShop...');
      const productsListUrl = `${apiEndpoint}/products?ws_key=${key}&output_format=JSON`;
      const listResponse = await fetchWithCors(productsListUrl);
      if (!listResponse.ok) throw new Error('No se pudo conectar a la API de PrestaShop. Revisa la URL, la clave de API y la configuración de CORS.');
      
      const listData = await listResponse.json();
      if (!listData.products || listData.products.length === 0) return [];
      
      const productIds = listData.products.map((p: any) => p.id);
      let allProducts: ShopifyProduct[] = [];

      for (let i = 0; i < productIds.length; i++) {
          const id = productIds[i];
          setLoadingMessage(`Procesando producto ${i + 1} de ${productIds.length}...`);
          const productUrl = `${apiEndpoint}/products/${id}?ws_key=${key}&output_format=JSON`;
          const productResponse = await fetchWithCors(productUrl);
          if (productResponse.ok) {
              const productData = await productResponse.json();
              const transformedProduct = await transformPrestaShopToShopify(productData.product, storeOrigin, key);
              allProducts.push(transformedProduct);
          }
          await delay(250);
      }
      return allProducts;
  };
  
    const transformPrestaShopToShopify = async (psProduct: any, storeOrigin: string, apiKey: string): Promise<ShopifyProduct> => {
        const findValue = (arr: any[]) => (arr && arr.length > 0 ? arr[0].value : '');
        const title = findValue(psProduct.name);
        
        const variants: ShopifyVariant[] = [];
        if (psProduct.associations.combinations && psProduct.associations.combinations.length > 0) {
             for(const comboRef of psProduct.associations.combinations) {
                const comboUrl = `${storeOrigin}/api/combinations/${comboRef.id}?ws_key=${apiKey}&output_format=JSON`;
                const comboRes = await fetchWithCors(comboUrl);
                if(comboRes.ok) {
                    const comboData = await comboRes.json();
                    const combination = comboData.combination;
                    const price = parseFloat(psProduct.price) + parseFloat(combination.price);
                    
                    const optionValues = combination.associations.product_option_values.map((v: any) => `ID:${v.id}`).join(' / ');
                    
                     variants.push({
                        id: combination.id,
                        title: optionValues,
                        price: price.toFixed(2),
                        compare_at_price: null,
                        sku: combination.reference || '',
                        available: parseInt(combination.quantity, 10) > 0,
                        option1: optionValues, option2: null, option3: null
                    });
                }
             }
        } else {
            variants.push({
                id: psProduct.id,
                title: 'Default Title',
                price: parseFloat(psProduct.price).toFixed(2),
                compare_at_price: null,
                sku: psProduct.reference || '',
                available: parseInt(psProduct.quantity, 10) > 0,
                option1: null, option2: null, option3: null,
            });
        }
    
        return {
            id: psProduct.id,
            title: title,
            handle: findValue(psProduct.link_rewrite),
            body_html: findValue(psProduct.description),
            vendor: psProduct.manufacturer_name || 'N/A',
            product_type: psProduct.category_name || 'N/A',
            created_at: psProduct.date_add,
            published_at: psProduct.active === '1' ? psProduct.date_upd : null,
            tags: [],
            variants: variants,
            images: psProduct.associations.images?.map((img: any) => ({
                src: `${storeOrigin}/${img.id}/${findValue(psProduct.link_rewrite)}.jpg`
            })) || [],
        };
    };

    const extractTiendaNubeProducts = async (userId: string, token: string): Promise<ShopifyProduct[]> => {
        const apiEndpoint = `https://api.tiendanube.com/v1/${userId}`;
        let allProducts: ShopifyProduct[] = [];
        let page = 1;
        const limit = 200;

        while(true) {
            setLoadingMessage(`Extrayendo productos de Tienda Nube... página ${page}`);
            const productsUrl = `${apiEndpoint}/products?page=${page}&per_page=${limit}`;
            const response = await fetchWithCors(productsUrl, {
                headers: {
                    'Authentication': `bearer ${token}`,
                    'User-Agent': 'Product Extractor (my-app.com)'
                }
            });

            if (!response.ok) {
                if(response.status === 401) throw new Error('Acceso no autorizado. Revisa tu ID de tienda y tu Token de Acceso.');
                throw new Error('No se pudo conectar a la API de Tienda Nube. Revisa el ID de la tienda y el Token de Acceso.');
            }
            
            const productsData = await response.json();
            if (productsData && productsData.length > 0) {
                const transformedProducts = productsData.map(transformTiendaNubeToShopify);
                allProducts = allProducts.concat(transformedProducts);
                setLoadingMessage(`Encontrados ${allProducts.length} productos...`);
                page++;
            } else {
                break;
            }
        }
        return allProducts;
    };

    const transformTiendaNubeToShopify = (tnProduct: any): ShopifyProduct => {
        const variants: ShopifyVariant[] = tnProduct.variants.map((v: any) => {
             const price = v.promotional_price || v.price;
             const compare_at_price = v.promotional_price ? v.price : null;

             const optionValues = v.attribute_values.map((attr: any) => attr.es || attr.en || attr.pt);

             return {
                id: v.id,
                title: optionValues.join(' / '),
                price: String(price),
                compare_at_price: String(compare_at_price),
                sku: v.sku || '',
                available: v.stock_management ? (v.stock || 0) > 0 : true,
                option1: optionValues[0] || null,
                option2: optionValues[1] || null,
                option3: optionValues[2] || null,
             }
        });
        
        return {
            id: tnProduct.id,
            title: tnProduct.name.es || tnProduct.name.en,
            handle: tnProduct.handle.es || tnProduct.handle.en,
            body_html: tnProduct.description.es || tnProduct.description.en,
            vendor: tnProduct.brand || 'N/A',
            product_type: tnProduct.categories?.[0]?.name?.es || 'N/A',
            created_at: tnProduct.created_at,
            published_at: tnProduct.published ? tnProduct.published_at : null,
            tags: tnProduct.tags ? tnProduct.tags.split(',').map((t:string) => t.trim()) : [],
            variants: variants,
            images: tnProduct.images?.map((img: any) => ({ src: img.src })) || [],
        };
    };

  const handleAction = async () => {
    setIsLoading(true);
    setError(null);
    setProducts([]);
    setLoadingMessage('Iniciando...');

    try {
      let extractedProducts: ShopifyProduct[] = [];
      if (storeType === 'shopify') {
        if (shopifyMethod === 'public') {
          if (!url) throw new Error('Por favor, introduce la URL de la tienda Shopify.');
          extractedProducts = await extractShopifyProductsPublic(url);
        } else {
          if (!shopifyStoreName) throw new Error('Por favor, introduce el nombre de la tienda Shopify.');
          if (!shopifyApiToken) throw new Error('Por favor, introduce el Token de Acceso para la API de Shopify.');
          extractedProducts = await extractShopifyProductsPrivate(shopifyStoreName, shopifyApiToken);
        }
      } else if (storeType === 'prestashop') {
        if (!url) throw new Error('Por favor, introduce la URL de la tienda PrestaShop.');
        if (!apiKey) throw new Error('Por favor, introduce la clave de API para PrestaShop.');
        extractedProducts = await extractPrestaShopProducts(url, apiKey);
      } else if (storeType === 'tiendanube') {
        if (!tiendaNubeUserId) throw new Error('Por favor, introduce el ID de la tienda de Tienda Nube.');
        if (!tiendaNubeToken) throw new Error('Por favor, introduce el Token de Acceso para Tienda Nube.');
        extractedProducts = await extractTiendaNubeProducts(tiendaNubeUserId, tiendaNubeToken);
      }
      
      if (extractedProducts.length === 0 && !error) {
        setError('No se encontraron productos. Revisa los datos introducidos.');
      } else {
        setProducts(extractedProducts);
      }

    } catch (err) {
      const psError = storeType === 'prestashop' ? ' Adicionalmente, revisa que el servicio web esté activado y los permisos de CORS estén configurados en el servidor.' : '';
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.' + psError);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };
  
  const getTags = (tags: string[] | string): string => {
    if (Array.isArray(tags)) {
        return tags.join(', ');
    }
    return tags;
  };

  const getStoreIdentifier = () => {
    try {
        if (storeType === 'shopify') {
            return shopifyMethod === 'public' ? new URL(url.trim()).hostname.replace('www.', '') : shopifyStoreName;
        }
        if (storeType === 'prestashop') {
            return new URL(url.trim()).hostname.replace('www.', '');
        }
        if (storeType === 'tiendanube') {
            return tiendaNubeUserId || 'tiendanube-user';
        }
    } catch {
        return 'export';
    }
    return 'export';
  };

  const cleanShopifyImageUrl = (url: string | undefined | null): string => {
    if (!url) return '';
    return url.split('?')[0];
  };
    
  const handleExport = () => {
    if (products.length === 0) return;

    const toProperCase = (str: string): string => str ? str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) : '';
    const cleanHtmlDescription = (html: string): string => html ? html.replace(/<\/p>/gi, '. ').replace(/<br\s*\/?>/gi, '. ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\s*\.\s*/g, '. ').trim() : '';
    
    const flattenedData = products.flatMap((p) => p.variants.map((v) => ({ 'ID Producto': p.id, 'Handle': p.handle, 'Título Producto': p.title, 'Descripción': p.body_html, 'Vendedor': p.vendor, 'Categoría': p.product_type, 'Tags': getTags(p.tags), 'Publicado': p.published_at ? 'Sí' : 'No', 'Fecha Publicación': p.published_at, 'ID Variante': v.id, 'Título Variante': v.title, 'SKU': v.sku, 'Precio': parseFloat(v.price), 'Precio de Comparación': v.compare_at_price ? parseFloat(v.compare_at_price) : '', 'Disponible': v.available ? 'Sí' : 'No', 'Opción 1': v.option1, 'Opción 2': v.option2, 'Opción 3': v.option3, 'URLs de Imágenes': p.images.map(img => cleanShopifyImageUrl(img.src)).join(', ') })));
    // FIX: Iterate over product variants (`v`) to access variant-specific properties.
    const coppelData = products.flatMap((p) => p.variants.map((v) => {
        const images = p.images.map(img => cleanShopifyImageUrl(img.src));
        const price = parseFloat(v.price);
        const compareAtPrice = v.compare_at_price ? parseFloat(v.compare_at_price) : null;
        const precioLista = (compareAtPrice && compareAtPrice > price) ? compareAtPrice : price;
        const precioPromo = (compareAtPrice && compareAtPrice > price) ? price : '';
        return { 'Categoría / Tipo de producto': p.product_type, 'SKU': v.sku || '', 'Nombre del producto': toProperCase(p.title), 'UPC': '', 'ID de producto - Variante': v.id, 'Marca (Aquí va el dato que obtienes de vendedor)': p.vendor, 'Modelo': '', 'Color': v.option2 || '', 'Descripción corta': '', 'Descripción larga (esta seria de la descripción que ya descargas)': cleanHtmlDescription(p.body_html), 'Ciudad de origen': 'México', 'Material': '', 'Medidas': '', 'Peso del producto': '', 'Código Variante (Aquí ira el código del producto)': p.id, 'Imagen 1': images[0] || '', 'Imagen 2': images[1] || '', 'Imagen 3': images[2] || '', 'Imagen 4': images[3] || '', 'Imagen 5': images[4] || '', 'Imagen 6': images[5] || '', 'Imagen 7': images[6] || '', 'Imagen 8': images[7] || '', 'SEO (Aquí iran las Tags)': getTags(p.tags), 'Talla (Aquí iran las tallas)': v.option1 || '', 'Disponible (Si/No)': v.available ? 'Sí' : 'No', 'Titulo de Variante': v.title, 'Precio Lista': precioLista, 'Precio Promo': precioPromo };
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flattenedData), 'Productos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coppelData), 'Formato Coppel');
    
    XLSX.writeFile(wb, `${storeType}-productos-${getStoreIdentifier()}.xlsx`);
  };

  const handleExportCSV = () => {
    if (products.length === 0) return;

    const flattenedData = products.flatMap((p) =>
      p.variants.map((v) => ({
        'ID Producto': p.id,
        'Handle': p.handle,
        'Título Producto': p.title,
        'Descripción': p.body_html,
        'Vendedor': p.vendor,
        'Categoría': p.product_type,
        'Tags': getTags(p.tags),
        'Publicado': p.published_at ? 'Sí' : 'No',
        'Fecha Publicación': p.published_at,
        'ID Variante': v.id,
        'Título Variante': v.title,
        'SKU': v.sku,
        'Precio': parseFloat(v.price),
        'Precio de Comparación': v.compare_at_price ? parseFloat(v.compare_at_price) : '',
        'Disponible': v.available ? 'Sí' : 'No',
        'Opción 1': v.option1,
        'Opción 2': v.option2,
        'Opción 3': v.option3,
        'URLs de Imágenes': p.images.map((img) => cleanShopifyImageUrl(img.src)).join(', '),
      }))
    );
      
    const ws = XLSX.utils.json_to_sheet(flattenedData);
    const csvOutput = XLSX.utils.sheet_to_csv(ws);

    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${storeType}-productos-${getStoreIdentifier()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const getPlaceholder = (): string => {
    switch(storeType) {
        case 'shopify':
            return 'Ej: https://tienda-ejemplo.com';
        case 'prestashop':
            return 'Ej: https://tienda-ejemplo.com';
        default:
            return '';
    }
  }
  
  const getButtonText = () => {
      if (isLoading) return 'Procesando...';
      return 'Extraer Productos';
  }

  return (
    <>
      <header className="app-header">
        <div className="user-info">Bienvenido, Empleado #{user.email}</div>
        <nav className="app-nav">
          {user.role === 'admin' && <button className="btn btn-nav" onClick={() => onNavigate('admin')}>Panel de Admin</button>}
          <button className="btn btn-nav" onClick={onLogout}>Cerrar Sesión</button>
        </nav>
      </header>
      <div className="container">
        <div className="header">
          <h1>Extractor de Productos</h1>
          <p>Elige el tipo de tienda, introduce los datos y extrae su catálogo de productos para exportarlo a Excel.</p>
        </div>

        <div className="form">
           <div className="store-selector">
              <button className={`btn ${storeType === 'shopify' ? 'active' : ''}`} onClick={() => {setStoreType('shopify');}}>Shopify</button>
              <button className={`btn ${storeType === 'prestashop' ? 'active' : ''}`} onClick={() => {setStoreType('prestashop');}}>PrestaShop</button>
              <button className={`btn ${storeType === 'tiendanube' ? 'active' : ''}`} onClick={() => {setStoreType('tiendanube');}}>Tienda Nube</button>
           </div>
           
           <div className="input-group vertical">
            { storeType === 'shopify' && (
                <div className="shopify-options">
                    <div className="method-selector">
                        <button className={`btn ${shopifyMethod === 'public' ? 'active' : ''}`} onClick={() => setShopifyMethod('public')}>URL Pública</button>
                        <button className={`btn ${shopifyMethod === 'private' ? 'active' : ''}`} onClick={() => setShopifyMethod('private')}>API Privada</button>
                    </div>
                    {shopifyMethod === 'public' ? (
                        <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={getPlaceholder()} aria-label="URL de la tienda" disabled={isLoading} />
                    ) : (
                        <>
                            <input type="text" className="url-input" value={shopifyStoreName} onChange={(e) => setShopifyStoreName(e.target.value)} placeholder="nombre-tienda (de nombre-tienda.myshopify.com)" aria-label="Nombre de la tienda Shopify" disabled={isLoading} />
                            <input type="password" className="url-input" value={shopifyApiToken} onChange={(e) => setShopifyApiToken(e.target.value)} placeholder="Token de Acceso de la API" aria-label="Token de Acceso de la API de Shopify" disabled={isLoading} />
                        </>
                    )}
                </div>
            )}

            { storeType === 'prestashop' && (
                 <>
                    <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={getPlaceholder()} aria-label="URL de la tienda" disabled={isLoading} />
                    <input type="text" className="url-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clave de API de PrestaShop" aria-label="Clave de API de PrestaShop" disabled={isLoading} />
                 </>
            )}

            {storeType === 'tiendanube' && (
              <>
                <input type="text" className="url-input" value={tiendaNubeUserId} onChange={(e) => setTiendaNubeUserId(e.target.value)} placeholder="ID de la Tienda (User ID)" aria-label="ID de la Tienda de Tienda Nube" disabled={isLoading} />
                <input type="password" className="url-input" value={tiendaNubeToken} onChange={(e) => setTiendaNubeToken(e.target.value)} placeholder="Token de Acceso (Access Token)" aria-label="Token de Acceso de Tienda Nube" disabled={isLoading} />
              </>
            )}
            
          </div>

           <button className="btn btn-primary" onClick={handleAction} disabled={isLoading} style={{width: '100%'}}>{getButtonText()}</button>
        </div>

        <div className="status">
          {isLoading && (<div className="loading-status"><div className="loader"></div><p>{loadingMessage}</p></div>)}
          {error && <div className="error-message">{error}</div>}
          {products.length > 0 && !isLoading && (
            <div className='success-message'>
                <p>¡Éxito! Se encontraron {products.length} productos.</p>
                <div className="export-buttons">
                    <button className="btn btn-secondary" onClick={handleExport}>Descargar Excel (.xlsx)</button>
                    <button className="btn btn-tertiary" onClick={handleExportCSV}>Descargar CSV (.csv)</button>
                </div>
            </div>
           )}
        </div>

      </div>
    </>
  );
};

// Admin Panel Component (Unreachable and disabled)
const AdminPage: React.FC<{ user: User, onNavigate: (page: Page) => void }> = ({ user, onNavigate }) => {
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    return (
        <div className="admin-container">
            <header className="admin-header">
                <h2>Panel de Administración</h2>
                <button className="btn btn-nav" onClick={() => onNavigate('app')}>Volver a la App</button>
            </header>
            
            {message && <div className={message.type === 'success' ? 'success-message-banner' : 'error-message'}>{message.text}</div>}

            <div className="admin-section">
                <h3>Cambiar mi Contraseña</h3>
                <form onSubmit={(e) => e.preventDefault()} className="admin-form">
                    <input type="password" placeholder="Nueva Contraseña" required disabled />
                    <input type="password" placeholder="Confirmar Nueva Contraseña" required disabled />
                    <button type="submit" className="btn btn-primary" disabled>Actualizar Contraseña</button>
                </form>
            </div>

            <div className="admin-section">
                <h3>Agregar Nuevo Usuario</h3>
                <form onSubmit={(e) => e.preventDefault()} className="admin-form">
                    <input type="email" placeholder="Correo electrónico" required disabled />
                    <input type="password" placeholder="Contraseña" required disabled />
                    <select disabled>
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                    </select>
                    <button type="submit" className="btn btn-primary" disabled>Agregar Usuario</button>
                </form>
            </div>

            <div className="admin-section">
                <h3>Gestionar Usuarios</h3>
                <p>La gestión de usuarios no está disponible con el inicio de sesión por número de empleado.</p>
                <table className="user-table">
                    <thead>
                        <tr>
                            <th>Correo Electrónico</th>
                            <th>Rol</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colSpan={3} style={{textAlign: 'center'}}>No hay usuarios para gestionar.</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// Login Component
const LoginPage: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{8}$/.test(employeeId) || !employeeId.startsWith('90')) {
      setError('Numero de empleado incorrecto.');
      return;
    }

    const expectedPassword = employeeId.slice(-4);
    if (password !== expectedPassword) {
      setError('Contraseña incorrecta.');
      return;
    }

    const user: User = {
      email: employeeId,
      passwordHash: '',
      role: 'user',
    };
    
    onLogin(user);
  };

  return (
    <div className="login-container">
      <div className="container">
        <div className="header">
          <h1>Iniciar Sesión</h1>
          <p>Accede con tu número de empleado.</p>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <div className="input-group vertical">
            <input 
              type="text" 
              value={employeeId} 
              onChange={(e) => setEmployeeId(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="#Empleado" 
              required 
              className="url-input"
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Contraseña" 
              required 
              className="url-input"
            />
          </div>
           {error && <div className="error-message" style={{marginTop: '1rem'}}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{marginTop: '1rem', width: '100%'}}>Entrar</button>
        </form>
      </div>
    </div>
  );
};


// Main App Component
const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('login');
  
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setPage('app');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPage('login');
  };

  const handleNavigation = (newPage: Page) => {
    if (currentUser?.role === 'admin' || newPage !== 'admin') {
      setPage(newPage);
    }
  };

  const renderPage = () => {
    switch (page) {
      case 'app':
        return currentUser && <ExtractorPage user={currentUser} onNavigate={handleNavigation} onLogout={handleLogout} />;
      case 'admin':
        // A user can still try to navigate here, but it will be a disabled page
        return currentUser && <AdminPage user={currentUser} onNavigate={handleNavigation} />;
      case 'login':
      default:
        return <LoginPage onLogin={handleLogin} />;
    }
  };

  return <div className="app-wrapper">{renderPage()}</div>;
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

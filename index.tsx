import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';

// --- INTERFACES AND TYPES ---
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
  tags: string[] | string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

type UserRole = 'admin' | 'user';

interface User {
  email: string;
  passwordHash: string;
  role: UserRole;
}

type Page = 'login' | 'app' | 'admin';
type StoreType = 'shopify' | 'prestashop' | 'tiendanube' | 'vtex' | 'woocommerce';
type ShopifyMethod = 'public' | 'private';

// --- HELP CONTENT ---
interface HelpTopic {
    title: string;
    steps: { text: string; }[];
}

const HELP_GUIDES: Record<string, HelpTopic> = {
    'shopify-private': {
        title: 'Obtener Token de API Privada de Shopify',
        steps: [
            { text: "1. Inicia sesión en tu panel de administrador de Shopify. En el menú de la izquierda, haz clic en 'Configuración' (el ícono de engranaje) en la esquina inferior." },
            { text: "2. En el menú de Configuración, selecciona 'Apps y canales de ventas'." },
            { text: "3. Haz clic en 'Desarrollar apps para tu tienda'. Si es la primera vez, puede que necesites aceptar los términos." },
            { text: "4. Haz clic en 'Crear una app'. Dale un nombre descriptivo, por ejemplo, 'Extractor de Productos', y haz clic en 'Crear app'." },
            { text: "5. Una vez creada la app, ve a la pestaña 'Configurar alcances de la API de Admin'. Busca y selecciona el permiso `read_products`. Este es el único permiso necesario. Haz clic en 'Guardar'." },
            { text: "6. Ve a la pestaña 'Credenciales de API'. Haz clic en el botón 'Instalar app' y confirma la instalación. Una vez instalada, se revelará el 'Token de acceso de la API de administrador'. Cópialo inmediatamente y guárdalo en un lugar seguro. ¡Este token solo se muestra una vez!" }
        ]
    },
    'prestashop-api': {
        title: 'Obtener Clave de API de PrestaShop',
        steps: [
            { text: "1. Inicia sesión en tu panel de administrador de PrestaShop. En el menú de la izquierda, ve a 'Parámetros Avanzados' y luego selecciona 'Webservice'." },
            { text: "2. Asegúrate de que la opción 'Activar el Webservice de PrestaShop' esté marcada como 'Sí'. Si no lo está, actívala y haz clic en 'Guardar'." },
            { text: "3. Haz clic en el botón 'Añadir nueva clave de webservice' en la esquina superior derecha." },
            { text: "4. Haz clic en el botón 'Generar!'. Se creará una nueva clave alfanumérica en el campo 'Clave'." },
            { text: "5. En la sección de 'Permisos', marca la casilla 'GET' (para leer datos) en las filas correspondientes a los siguientes recursos: `products`, `combinations`, `images`, `manufacturers` y `categories`. Haz clic en 'Guardar'." },
            { text: "6. Copia la clave generada del campo 'Clave' y pégala en la herramienta." }
        ]
    },
    'tiendanube-api': {
        title: 'Obtener Credenciales de Tienda Nube',
        steps: [
            { text: "1. Para obtener el ID de la Tienda (User ID): Inicia sesión en tu panel de administración. En la esquina inferior izquierda, verás tu nombre de usuario o el nombre de tu tienda. Justo al lado, verás un número. Ese número es tu User ID." },
            { text: "2. Para obtener el Token de Acceso: En el menú principal, ve a 'Configuraciones > Herramientas externas > Aplicaciones'." },
            { text: "3. Haz clic en 'Crear tu primera aplicación'. Dale un nombre descriptivo (ej. 'Extractor de Catálogo')." },
            { text: "4. En la sección 'Permisos', busca la categoría 'Productos'. Asegúrate de que la casilla 'Leer productos' esté marcada. No necesitas otros permisos." },
            { text: "5. Haz clic en 'Aceptar' y luego en 'Guardar aplicación'. El sistema te mostrará las credenciales. Copia el 'Token de Acceso' (Access Token)." }
        ]
    },
    'vtex-api': {
        title: 'Obtener Credenciales de VTEX',
        steps: [
            { text: "1. Inicia sesión en tu panel de administración de VTEX. En el menú, ve a 'Configuración de la cuenta' y luego selecciona 'Administración de la cuenta > Claves de aplicación'." },
            { text: "2. Haz clic en el botón 'Generar nuevas claves de aplicación'." },
            { text: "3. Dale un nombre descriptivo a la clave para identificarla (ej. 'Extractor de Productos'). Luego, en la sección 'Perfiles de acceso', asegúrate de asociarla a un perfil que tenga permisos de lectura para el 'Catálogo' (por ejemplo, el perfil de 'Admin - Super')." },
            { text: "4. Haz clic en 'Generar'. El sistema mostrará la 'Clave de Aplicación' (AppKey) y el 'Token de Aplicación' (AppToken). Copia ambos valores inmediatamente. ¡El AppToken solo se muestra una vez! Si lo pierdes, tendrás que generar un nuevo par de claves." }
        ]
    },
    'woocommerce-api': {
        title: 'Obtener Credenciales de WooCommerce',
        steps: [
            { text: "1. Inicia sesión en tu panel de administrador de WordPress. En el menú de la izquierda, ve a 'WooCommerce > Ajustes'." },
            { text: "2. Dentro de los ajustes de WooCommerce, haz clic en la pestaña 'Avanzado'." },
            { text: "3. En la página de 'Avanzado', haz clic en el enlace 'REST API'." },
            { text: "4. Haz clic en el botón 'Añadir clave' o 'Crear una clave de API'." },
            { text: "5. Dale una 'Descripción' (ej. 'Extractor de Productos'), selecciona un 'Usuario' que tenga rol de Administrador y, lo más importante, en 'Permisos', selecciona la opción 'Lectura'." },
            { text: "6. Haz clic en 'Generar clave de API'. El sistema mostrará la 'Clave de consumidor' y el 'Secreto de consumidor'. Cópialos inmediatamente y guárdalos en un lugar seguro, ya que el 'Secreto' no se volverá a mostrar." }
        ]
    }
};


// --- COMPONENTS ---

const HelpTrigger: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <div className="help-trigger-container" onClick={onClick} role="button" aria-label="Mostrar ayuda">
        <span className="help-trigger-icon">?</span>
    </div>
);

const HelpSidebar: React.FC<{ topic: HelpTopic | null, onClose: () => void }> = ({ topic, onClose }) => {
    if (!topic) return null;
    return (
        <div className="help-sidebar">
            <div className="help-sidebar-header">
                <h3>{topic.title}</h3>
                <button onClick={onClose} className="btn-close-help" aria-label="Cerrar ayuda">&times;</button>
            </div>
            <div className="help-sidebar-content">
                <ol>
                    {topic.steps.map((step, index) => (
                        <li key={index}>
                            <p>{step.text}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
};

// Extractor Component
const ExtractorPage: React.FC<{ user: User, onNavigate: (page: Page) => void, onLogout: () => void }> = ({ user, onNavigate, onLogout }) => {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [storeType, setStoreType] = useState<StoreType>('shopify');
  
  // Shopify state
  const [shopifyMethod, setShopifyMethod] = useState<ShopifyMethod>('public');
  const [shopifyStoreName, setShopifyStoreName] = useState('');
  const [shopifyApiToken, setShopifyApiToken] = useState('');

  // Tienda Nube state
  const [tiendaNubeUserId, setTiendaNubeUserId] = useState('');
  const [tiendaNubeToken, setTiendaNubeToken] = useState('');

  // VTEX state
  const [vtexAccountName, setVtexAccountName] = useState('');
  const [vtexAppKey, setVtexAppKey] = useState('');
  const [vtexAppToken, setVtexAppToken] = useState('');
  
  // WooCommerce state
  const [wooConsumerKey, setWooConsumerKey] = useState('');
  const [wooConsumerSecret, setWooConsumerSecret] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [activeHelp, setActiveHelp] = useState<HelpTopic | null>(null);
  
  const showHelp = (topicKey: keyof typeof HELP_GUIDES) => setActiveHelp(HELP_GUIDES[topicKey]);
  const hideHelp = () => setActiveHelp(null);

  /**
   * Securely fetches data via our own backend proxy.
   * This is the new, secure way to handle all cross-origin API requests.
   */
  const fetchViaBackendProxy = async (targetUrl: string, options?: RequestInit) => {
    // The frontend sends the target URL and options to our own backend.
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        options: {
            ...options,
            // The backend will attach sensitive headers (like API keys)
            // ensuring they are never exposed client-side.
        },
      }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Backend proxy error:", errorBody);
        throw new Error(`Error en la comunicación con el servidor: ${response.statusText}`);
    }
    
    // We also need to handle Link headers for pagination, passed back from the proxy
    const linkHeader = response.headers.get('proxy-link');
    const responseData = await response.json();

    return { data: responseData, linkHeader };
  };
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- SHOPIFY ---
  const extractShopifyProductsPublic = async (rawUrl: string): Promise<ShopifyProduct[]> => {
    let storeUrl = new URL(rawUrl.trim());
    storeUrl = new URL(storeUrl.origin);

    let allProducts: ShopifyProduct[] = [];
    let page = 1;
    const limit = 250;

    while (true) {
      setLoadingMessage(`Extrayendo productos de Shopify (Público)... página ${page}`);
      const productsJsonUrl = `${storeUrl.href}/products.json?limit=${limit}&page=${page}`;
      // This is a public URL, so a direct fetch is often okay, but proxying is safer.
      const response = await fetch(productsJsonUrl); 
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
    const apiVersion = '2024-04';
    const apiEndpoint = `https://${storeName}.myshopify.com/admin/api/${apiVersion}/products.json`;
    let allProducts: ShopifyProduct[] = [];
    let nextUrl: string | null = `${apiEndpoint}?limit=250`;

    while (nextUrl) {
        setLoadingMessage(`Extrayendo productos de Shopify (API Privada)...`);
        const { data, linkHeader } = await fetchViaBackendProxy(nextUrl, {
            headers: { 'X-Shopify-Access-Token': apiToken },
        });

        if (data.errors) {
             throw new Error(`Error de la API de Shopify: ${JSON.stringify(data.errors)}`);
        }
        
        if (data.products && data.products.length > 0) {
            allProducts = allProducts.concat(data.products);
            setLoadingMessage(`Encontrados ${allProducts.length} productos...`);
        }

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

  // --- PRESTASHOP ---
  const extractPrestaShopProducts = async (rawUrl: string, key: string): Promise<ShopifyProduct[]> => {
      let storeUrl = new URL(rawUrl.trim());
      const storeOrigin = storeUrl.origin;
      const apiEndpoint = `${storeOrigin}/api`;

      setLoadingMessage('Obteniendo lista de productos de PrestaShop...');
      const productsListUrl = `${apiEndpoint}/products?ws_key=${key}&output_format=JSON`;
      const { data: listData } = await fetchViaBackendProxy(productsListUrl);
      
      if (!listData.products || listData.products.length === 0) return [];
      
      const productIds = listData.products.map((p: any) => p.id);
      let allProducts: ShopifyProduct[] = [];

      for (let i = 0; i < productIds.length; i++) {
          const id = productIds[i];
          setLoadingMessage(`Procesando producto ${i + 1} de ${productIds.length}...`);
          const productUrl = `${apiEndpoint}/products/${id}?ws_key=${key}&output_format=JSON`;
          const { data: productData } = await fetchViaBackendProxy(productUrl);
          if (productData.product) {
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
                const { data: comboData } = await fetchViaBackendProxy(comboUrl);
                if(comboData.combination) {
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
                src: `${storeOrigin}/api/images/products/${psProduct.id}/${img.id}?ws_key=${apiKey}`
            })) || [],
        };
    };

    // --- TIENDA NUBE ---
    const extractTiendaNubeProducts = async (userId: string, token: string): Promise<ShopifyProduct[]> => {
        const apiEndpoint = `https://api.tiendanube.com/v1/${userId}`;
        let allProducts: ShopifyProduct[] = [];
        let page = 1;
        const limit = 200;

        while(true) {
            setLoadingMessage(`Extrayendo productos de Tienda Nube... página ${page}`);
            const productsUrl = `${apiEndpoint}/products?page=${page}&per_page=${limit}`;
            const { data: productsData } = await fetchViaBackendProxy(productsUrl, {
                headers: {
                    'Authentication': `bearer ${token}`,
                    'User-Agent': 'Product Extractor App'
                }
            });

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
             const optionValues = v.values.map((attr: any) => attr.es || attr.en || attr.pt);

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

    // --- VTEX ---
    const extractVtexProducts = async (accountName: string, appKey: string, appToken: string): Promise<ShopifyProduct[]> => {
      let allProducts: ShopifyProduct[] = [];
      const limit = 100;
      let from = 0;
      let to = limit - 1;
      let totalFetched = 0;
      
      while(true) {
        setLoadingMessage(`Extrayendo productos de VTEX... (${totalFetched} encontrados)`);
        const searchUrl = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`;
        const { data: productsData } = await fetchViaBackendProxy(searchUrl, {
          headers: {
            'X-VTEX-API-AppKey': appKey,
            'X-VTEX-API-AppToken': appToken,
            'Accept': 'application/json'
          }
        });

        if (productsData && productsData.length > 0) {
          const transformed = productsData.map(transformVtexToShopify);
          allProducts = allProducts.concat(transformed);
          totalFetched += productsData.length;
          from += limit;
          to += limit;
        } else {
          break;
        }
      }
      return allProducts;
    };

    const transformVtexToShopify = (vtexProduct: any): ShopifyProduct => {
        const firstSku = vtexProduct.items[0];
        const variants = vtexProduct.items.map((sku: any): ShopifyVariant => ({
            id: sku.itemId,
            title: sku.nameComplete,
            price: sku.sellers[0]?.commertialOffer?.Price.toString() || '0',
            compare_at_price: sku.sellers[0]?.commertialOffer?.ListPrice.toString() || null,
            sku: sku.referenceId?.[0]?.Value || '',
            available: (sku.sellers[0]?.commertialOffer?.AvailableQuantity || 0) > 0,
            option1: vtexProduct.allSpecifications?.[0] ? sku[vtexProduct.allSpecifications[0]]?.[0] : null,
            option2: vtexProduct.allSpecifications?.[1] ? sku[vtexProduct.allSpecifications[1]]?.[0] : null,
            option3: vtexProduct.allSpecifications?.[2] ? sku[vtexProduct.allSpecifications[2]]?.[0] : null,
        }));

        return {
            id: vtexProduct.productId,
            title: vtexProduct.productName,
            handle: vtexProduct.linkText,
            body_html: vtexProduct.description,
            vendor: vtexProduct.brand,
            product_type: vtexProduct.categories?.[0]?.split('/')?.pop() || 'N/A',
            created_at: '', 
            published_at: vtexProduct.releaseDate || null,
            tags: vtexProduct.productClusters ? Object.values(vtexProduct.productClusters) : [],
            variants: variants,
            images: firstSku.images.map((img: any) => ({ src: img.imageUrl.replace('http://', 'https://') })) || [],
        };
    };

    // --- WOOCOMMERCE ---
    const extractWooCommerceProducts = async (storeUrl: string, consumerKey: string, consumerSecret: string): Promise<ShopifyProduct[]> => {
        let allProducts: ShopifyProduct[] = [];
        let page = 1;
        const limit = 100;

        while (true) {
            setLoadingMessage(`Extrayendo productos de WooCommerce... página ${page}`);
            const apiUrl = new URL(`${storeUrl.trim()}/wp-json/wc/v3/products`);
            apiUrl.searchParams.append('consumer_key', consumerKey);
            apiUrl.searchParams.append('consumer_secret', consumerSecret);
            apiUrl.searchParams.append('per_page', limit.toString());
            apiUrl.searchParams.append('page', page.toString());
            
            const { data: productsData } = await fetchViaBackendProxy(apiUrl.toString());
            
            if (productsData && productsData.length > 0) {
                const transformed = productsData.map(transformWooCommerceToShopify);
                allProducts = allProducts.concat(transformed);
                setLoadingMessage(`Encontrados ${allProducts.length} productos...`);
                page++;
            } else {
                break;
            }
        }
        return allProducts;
    };
    
    const transformWooCommerceToShopify = (wooProduct: any): ShopifyProduct => {
        const variants = wooProduct.variations_data ? 
            wooProduct.variations_data.map((v: any): ShopifyVariant => ({
                id: v.id,
                title: Object.values(v.attributes).join(' / '),
                price: v.price,
                compare_at_price: v.regular_price,
                sku: v.sku,
                available: v.stock_status === 'instock',
                option1: v.attributes?.attribute_pa_talla || v.attributes?.attribute_talla || null,
                option2: v.attributes?.attribute_pa_color || v.attributes?.attribute_color || null,
                option3: null
            })) : 
            [{
                id: wooProduct.id,
                title: 'Default Title',
                price: wooProduct.price,
                compare_at_price: wooProduct.regular_price,
                sku: wooProduct.sku,
                available: wooProduct.stock_status === 'instock',
                option1: null, option2: null, option3: null
            }];

        return {
            id: wooProduct.id,
            title: wooProduct.name,
            handle: wooProduct.slug,
            body_html: wooProduct.description,
            vendor: 'N/A', // WooCommerce doesn't have a native brand/vendor field
            product_type: wooProduct.categories?.[0]?.name || 'N/A',
            created_at: wooProduct.date_created,
            published_at: wooProduct.status === 'publish' ? wooProduct.date_modified : null,
            tags: wooProduct.tags.map((t: any) => t.name),
            variants: variants,
            images: wooProduct.images.map((img: any) => ({ src: img.src })),
        };
    };

  const handleAction = async () => {
    setIsLoading(true);
    setError(null);
    setProducts([]);
    setLoadingMessage('Iniciando...');

    try {
      let extractedProducts: ShopifyProduct[] = [];
      switch(storeType) {
        case 'shopify':
          if (shopifyMethod === 'public') {
            if (!url) throw new Error('Por favor, introduce la URL de la tienda Shopify.');
            extractedProducts = await extractShopifyProductsPublic(url);
          } else {
            if (!shopifyStoreName || !shopifyApiToken) throw new Error('Por favor, introduce el nombre de la tienda y el Token de Acceso.');
            extractedProducts = await extractShopifyProductsPrivate(shopifyStoreName, shopifyApiToken);
          }
          break;
        case 'prestashop':
          if (!url || !apiKey) throw new Error('Por favor, introduce la URL y la clave de API.');
          extractedProducts = await extractPrestaShopProducts(url, apiKey);
          break;
        case 'tiendanube':
          if (!tiendaNubeUserId || !tiendaNubeToken) throw new Error('Por favor, introduce el ID de tienda y el Token de Acceso.');
          extractedProducts = await extractTiendaNubeProducts(tiendaNubeUserId, tiendaNubeToken);
          break;
        case 'vtex':
            if (!vtexAccountName || !vtexAppKey || !vtexAppToken) throw new Error('Por favor, introduce el nombre de la cuenta, AppKey y AppToken.');
            extractedProducts = await extractVtexProducts(vtexAccountName, vtexAppKey, vtexAppToken);
            break;
        case 'woocommerce':
            if(!url || !wooConsumerKey || !wooConsumerSecret) throw new Error('Por favor, introduce la URL de la tienda, la Clave de Consumidor y el Secreto.');
            extractedProducts = await extractWooCommerceProducts(url, wooConsumerKey, wooConsumerSecret);
            break;
      }
      
      if (extractedProducts.length === 0 && !error) {
        setError('No se encontraron productos. Revisa los datos introducidos o los permisos de la API.');
      } else {
        setProducts(extractedProducts);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.');
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };
  
  const getTags = (tags: string[] | string): string => {
    if (Array.isArray(tags)) return tags.join(', ');
    return tags;
  };

  const getStoreIdentifier = () => {
    try {
        if (storeType === 'shopify') return shopifyMethod === 'public' ? new URL(url.trim()).hostname.replace('www.', '') : shopifyStoreName;
        if (storeType === 'prestashop' || storeType === 'woocommerce') return new URL(url.trim()).hostname.replace('www.', '');
        if (storeType === 'tiendanube') return tiendaNubeUserId || 'tiendanube';
        if (storeType === 'vtex') return vtexAccountName || 'vtex';
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

  return (
    <>
      <div className={`main-content ${activeHelp ? 'help-visible' : ''}`}>
        <header className="app-header">
            <div className="user-info">Bienvenido, {user.email === 'seller' ? 'Vendedor' : `Empleado #${user.email}`}</div>
            <nav className="app-nav">
            {user.role === 'admin' && <button className="btn btn-nav" onClick={() => onNavigate('admin')}>Panel de Admin</button>}
            <button className="btn btn-nav" onClick={onLogout}>Cerrar Sesión</button>
            </nav>
        </header>
        <div className="container">
            <div className="header">
            <h1>Extractor de Productos Multiplataforma</h1>
            <p>Elige una tienda, introduce las credenciales y extrae su catálogo de productos.</p>
            </div>

            <div className="form">
            <div className="store-selector">
                <button className={`btn ${storeType === 'shopify' ? 'active' : ''}`} onClick={() => setStoreType('shopify')}>Shopify</button>
                <button className={`btn ${storeType === 'prestashop' ? 'active' : ''}`} onClick={() => setStoreType('prestashop')}>PrestaShop</button>
                <button className={`btn ${storeType === 'tiendanube' ? 'active' : ''}`} onClick={() => setStoreType('tiendanube')}>Tienda Nube</button>
                <button className={`btn ${storeType === 'vtex' ? 'active' : ''}`} onClick={() => setStoreType('vtex')}>VTEX</button>
                <button className={`btn ${storeType === 'woocommerce' ? 'active' : ''}`} onClick={() => setStoreType('woocommerce')}>WooCommerce</button>
            </div>
            
            <div className="input-group vertical">
                { storeType === 'shopify' && (
                    <div className="shopify-options">
                        <div className="method-selector">
                            <button className={`btn ${shopifyMethod === 'public' ? 'active' : ''}`} onClick={() => setShopifyMethod('public')}>URL Pública</button>
                            <button className={`btn ${shopifyMethod === 'private' ? 'active' : ''}`} onClick={() => setShopifyMethod('private')}>API Privada</button>
                        </div>
                        {shopifyMethod === 'public' ? (
                            <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ej: https://tienda-ejemplo.com" aria-label="URL de la tienda" disabled={isLoading} />
                        ) : (
                            <>
                                <input type="text" className="url-input" value={shopifyStoreName} onChange={(e) => setShopifyStoreName(e.target.value)} placeholder="nombre-tienda (de nombre-tienda.myshopify.com)" aria-label="Nombre de la tienda Shopify" disabled={isLoading} />
                                <div className="input-with-help">
                                    <input type="password" className="url-input" value={shopifyApiToken} onChange={(e) => setShopifyApiToken(e.target.value)} placeholder="Token de Acceso de la API" aria-label="Token de Acceso de la API de Shopify" disabled={isLoading} />
                                    <HelpTrigger onClick={() => showHelp('shopify-private')} />
                                </div>
                            </>
                        )}
                    </div>
                )}

                { storeType === 'prestashop' && (
                    <>
                        <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ej: https://tienda-ejemplo.com" aria-label="URL de la tienda" disabled={isLoading} />
                        <div className="input-with-help">
                            <input type="password" className="url-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clave de API de PrestaShop (ws_key)" aria-label="Clave de API de PrestaShop" disabled={isLoading} />
                            <HelpTrigger onClick={() => showHelp('prestashop-api')} />
                        </div>
                    </>
                )}

                {storeType === 'tiendanube' && (
                <>
                    <div className="input-with-help">
                        <input type="text" className="url-input" value={tiendaNubeUserId} onChange={(e) => setTiendaNubeUserId(e.target.value)} placeholder="ID de la Tienda (User ID)" aria-label="ID de la Tienda de Tienda Nube" disabled={isLoading} />
                        <HelpTrigger onClick={() => showHelp('tiendanube-api')} />
                    </div>
                    <div className="input-with-help">
                        <input type="password" className="url-input" value={tiendaNubeToken} onChange={(e) => setTiendaNubeToken(e.target.value)} placeholder="Token de Acceso (Access Token)" aria-label="Token de Acceso de Tienda Nube" disabled={isLoading} />
                    </div>
                </>
                )}

                {storeType === 'vtex' && (
                <>
                    <input type="text" className="url-input" value={vtexAccountName} onChange={(e) => setVtexAccountName(e.target.value)} placeholder="Nombre de la cuenta VTEX" aria-label="Nombre de la cuenta VTEX" disabled={isLoading} />
                    <div className="input-with-help">
                        <input type="password" className="url-input" value={vtexAppKey} onChange={(e) => setVtexAppKey(e.target.value)} placeholder="Clave de Aplicación (AppKey)" aria-label="Clave de Aplicación VTEX" disabled={isLoading} />
                        <HelpTrigger onClick={() => showHelp('vtex-api')} />
                    </div>
                    <div className="input-with-help">
                        <input type="password" className="url-input" value={vtexAppToken} onChange={(e) => setVtexAppToken(e.target.value)} placeholder="Token de Aplicación (AppToken)" aria-label="Token de Aplicación VTEX" disabled={isLoading} />
                    </div>
                </>
                )}

                {storeType === 'woocommerce' && (
                <>
                    <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL de la tienda WordPress" aria-label="URL de la tienda WooCommerce" disabled={isLoading} />
                    <div className="input-with-help">
                        <input type="password" className="url-input" value={wooConsumerKey} onChange={(e) => setWooConsumerKey(e.target.value)} placeholder="Clave de Consumidor" aria-label="Clave de Consumidor de WooCommerce" disabled={isLoading} />
                        <HelpTrigger onClick={() => showHelp('woocommerce-api')} />
                    </div>
                    <div className="input-with-help">
                        <input type="password" className="url-input" value={wooConsumerSecret} onChange={(e) => setWooConsumerSecret(e.target.value)} placeholder="Secreto de Consumidor" aria-label="Secreto de Consumidor de WooCommerce" disabled={isLoading} />
                    </div>
                </>
                )}
                
            </div>

            <button className="btn btn-primary" onClick={handleAction} disabled={isLoading} style={{width: '100%'}}>{isLoading ? 'Procesando...' : 'Extraer Productos'}</button>
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
      </div>
      <HelpSidebar topic={activeHelp} onClose={hideHelp} />
    </>
  );
};

// Admin Panel Component (Unreachable and disabled)
const AdminPage: React.FC<{ user: User, onNavigate: (page: Page) => void }> = ({ user, onNavigate }) => {
    return (
        <div className="admin-container">
            <header className="admin-header">
                <h2>Panel de Administración</h2>
                <button className="btn btn-nav" onClick={() => onNavigate('app')}>Volver a la App</button>
            </header>
            <div className="admin-section">
                <h3>Funcionalidad de Admin Deshabilitada</h3>
                <p>La gestión de usuarios y otras funciones administrativas no están disponibles en este modo de la aplicación.</p>
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

    // New generic login check
    if (employeeId.toLowerCase() === 'seller' && password === '123') {
        const user: User = {
          email: 'seller', // Using 'seller' as the identifier
          passwordHash: '',
          role: 'user',
        };
        onLogin(user);
        return; // Exit the function after successful login
    }

    // Existing employee ID logic
    if (!/^\d{8}$/.test(employeeId) || !employeeId.startsWith('90')) {
      setError('Usuario o # de empleado incorrecto.');
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
          <p>Accede con tu usuario o número de empleado.</p>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <div className="input-group vertical">
            <input 
              type="text" 
              value={employeeId} 
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Usuario o #Empleado" 
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
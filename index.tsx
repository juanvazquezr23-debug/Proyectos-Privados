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

// --- COMPONENTS ---

// Extractor Component
const ExtractorPage: React.FC<{ user: User, onNavigate: (page: Page) => void, onLogout: () => void }> = ({ user, onNavigate, onLogout }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  
  /**
   * Fetches data using our own Vercel serverless function as a proxy.
   * This is a robust solution to bypass CORS issues without relying on unstable public proxies.
   */
  const fetchWithCors = async (targetUrl: string) => {
    // Our Vercel function is located at /api/proxy.
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    
    let response;
    try {
        // A client-side timeout is good practice for better user experience.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 seconds

        response = await fetch(proxyUrl, { signal: controller.signal });
        
        clearTimeout(timeoutId);

    } catch (networkError) {
        console.error("Error de red al contactar el proxy local (/api/proxy):", networkError);
        if (networkError instanceof Error && networkError.name === 'AbortError') {
             throw new Error('La solicitud tardó demasiado. La tienda Shopify podría no responder a tiempo. Inténtalo de nuevo.');
        }
        throw new Error('Error de red. No se pudo contactar tu backend. Revisa tu conexión a internet o el estado del despliegue en Vercel.');
    }

    if (!response.ok) {
        if (response.status === 404) {
             throw new Error('Error 404: No se encontró la tienda o la página de productos. Por favor, verifica que la URL de la tienda sea correcta.');
        }
        const errorData = await response.json().catch(() => ({ error: 'No se pudo leer la respuesta de error del servidor.' }));
        throw new Error(`Error ${response.status}: ${errorData.error || response.statusText}.`);
    }
  
    try {
        const shopifyData = await response.json();
        return { data: shopifyData };
    } catch(e) {
        console.error("Fallo al procesar la respuesta JSON del proxy:", e);
        throw new Error('La respuesta de tu backend no es un formato JSON válido. Puede haber un problema con la función de Vercel.');
    }
  };
  
  // --- SHOPIFY ---
  const extractShopifyProductsPublic = async (rawUrl: string): Promise<ShopifyProduct[]> => {
    let storeUrl = new URL(rawUrl.trim());
    storeUrl = new URL(storeUrl.origin);

    let allProducts: ShopifyProduct[] = [];
    let page = 1;
    const limit = 250;

    while (true) {
      setLoadingMessage(`Extrayendo productos de Shopify... página ${page}`);
      const productsJsonUrl = `${storeUrl.href}products.json?limit=${limit}&page=${page}`;
      const { data } = await fetchWithCors(productsJsonUrl);
      
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

  const handleAction = async () => {
    setError(null);
    setProducts([]);

    if (!url) {
      setError('Por favor, introduce la URL de la tienda Shopify.');
      return;
    }

    let correctedUrl = url.trim();
    if (!correctedUrl.startsWith('http://') && !correctedUrl.startsWith('https://')) {
        correctedUrl = `https://${correctedUrl}`;
    }

    try {
        new URL(correctedUrl);
    } catch (_) {
        setError('Por favor, introduce una URL con un formato válido. Ej: https://tienda.com');
        return;
    }

    setIsLoading(true);
    setLoadingMessage('Iniciando...');

    try {
      const extractedProducts = await extractShopifyProductsPublic(correctedUrl);
      
      if (extractedProducts.length === 0 && !error) {
        setError('La conexión fue exitosa, pero esta tienda no tiene productos. Por favor, añade al menos un producto e inténtalo de nuevo.');
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
        let correctedUrl = url.trim();
        if (!correctedUrl.startsWith('http://') && !correctedUrl.startsWith('https://')) {
            correctedUrl = `https://${correctedUrl}`;
        }
        return new URL(correctedUrl).hostname.replace('www.', '');
    } catch {
        return 'export';
    }
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
    
    XLSX.writeFile(wb, `shopify-productos-${getStoreIdentifier()}.xlsx`);
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
    link.setAttribute('download', `shopify-productos-${getStoreIdentifier()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="main-content">
        <header className="app-header">
            <div className="user-info">Bienvenido, {user.email === 'seller' ? 'Vendedor' : `Empleado #${user.email}`}</div>
            <nav className="app-nav">
            {user.role === 'admin' && <button className="btn btn-nav" onClick={() => onNavigate('admin')}>Panel de Admin</button>}
            <button className="btn btn-nav" onClick={onLogout}>Cerrar Sesión</button>
            </nav>
        </header>
        <div className="container">
            <div className="header">
            <h1>Extractor de Productos Shopify</h1>
            <p>Introduce la URL de una tienda Shopify para extraer su catálogo de productos.</p>
            </div>

            <div className="form">
                <div className="input-group vertical">
                    <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tienda-ejemplo.com" aria-label="URL de la tienda" disabled={isLoading} />
                    <small style={{ textAlign: 'left', color: '#666', display: 'block', marginTop: '4px' }}>
                        La URL debe empezar con http:// o https://
                    </small>
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
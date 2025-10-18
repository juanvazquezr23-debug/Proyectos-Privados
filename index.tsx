import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';

// --- INTERFACES AND TYPES ---
interface ShopifyVariant {
  id: number;
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
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  published_at: string | null;
  tags: string[];
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

// --- COMPONENTS ---

// Extractor Component
const ExtractorPage: React.FC<{ user: User, onNavigate: (page: Page) => void, onLogout: () => void }> = ({ user, onNavigate, onLogout }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [extractedCount, setExtractedCount] = useState(0);

  const handleExtract = async () => {
    setIsLoading(true);
    setError(null);
    setProducts([]);
    setExtractedCount(0);

    if (!url) {
      setError('Por favor, introduce la URL de una tienda Shopify.');
      setIsLoading(false);
      return;
    }

    try {
      let storeUrl = new URL(url.trim());
      storeUrl = new URL(storeUrl.origin);

      let allProducts: ShopifyProduct[] = [];
      let page = 1;
      const limit = 250;

      while (true) {
        const productsJsonUrl = `${storeUrl.href}/products.json?limit=${limit}&page=${page}`;
        const response = await fetch(productsJsonUrl);
        if (!response.ok) throw new Error('No se pudo acceder a los productos. Asegúrate de que la URL es correcta y es una tienda Shopify.');
        const data = await response.json();
        if (data.products && data.products.length > 0) {
          allProducts = allProducts.concat(data.products);
          setExtractedCount(allProducts.length);
          page++;
        } else {
          break;
        }
      }

      if (allProducts.length === 0) {
        setError('No se encontraron productos o no es una tienda Shopify válida.');
      } else {
        setProducts(allProducts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };
  
    const handleExport = () => {
    if (products.length === 0) return;

    const toProperCase = (str: string): string => str ? str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()) : '';
    const cleanHtmlDescription = (html: string): string => html ? html.replace(/<\/p>/gi, '. ').replace(/<br\s*\/?>/gi, '. ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\s*\.\s*/g, '. ').trim() : '';
    
    const flattenedData = products.flatMap((p) => p.variants.map((v) => ({ 'ID Producto': p.id, 'Handle': p.handle, 'Título Producto': p.title, 'Descripción': p.body_html, 'Vendedor': p.vendor, 'Categoría': p.product_type, 'Tags': p.tags.join(', '), 'Publicado': p.published_at ? 'Sí' : 'No', 'Fecha Publicación': p.published_at, 'ID Variante': v.id, 'Título Variante': v.title, 'SKU': v.sku, 'Precio': parseFloat(v.price), 'Precio de Comparación': v.compare_at_price ? parseFloat(v.compare_at_price) : '', 'Disponible': v.available ? 'Sí' : 'No', 'Opción 1': v.option1, 'Opción 2': v.option2, 'Opción 3': v.option3, 'URLs de Imágenes': p.images.map(img => img.src).join(', ') })));
    const coppelData = products.flatMap((p) => p.variants.map((v) => {
        const images = p.images.map(img => img.src);
        const price = parseFloat(v.price);
        const compareAtPrice = v.compare_at_price ? parseFloat(v.compare_at_price) : null;
        const precioLista = (compareAtPrice && compareAtPrice > price) ? compareAtPrice : price;
        const precioPromo = (compareAtPrice && compareAtPrice > price) ? price : '';
        return { 'Categoría / Tipo de producto': p.product_type, 'SKU': v.sku || '', 'Nombre del producto': toProperCase(p.title), 'UPC': '', 'ID de producto - Variante': v.id, 'Marca (Aquí va el dato que obtienes de vendedor)': p.vendor, 'Modelo': '', 'Color': v.option2 || '', 'Descripción corta': '', 'Descripción larga (esta seria de la descripción que ya descargas)': cleanHtmlDescription(p.body_html), 'Ciudad de origen': 'México', 'Material': '', 'Medidas': '', 'Peso del producto': '', 'Código Variante (Aquí ira el código del producto)': p.id, 'Imagen 1': images[0] || '', 'Imagen 2': images[1] || '', 'Imagen 3': images[2] || '', 'Imagen 4': images[3] || '', 'Imagen 5': images[4] || '', 'Imagen 6': images[5] || '', 'Imagen 7': images[6] || '', 'Imagen 8': images[7] || '', 'SEO (Aquí iran las Tags)': p.tags.join(', '), 'Talla (Aquí iran las tallas)': v.option1 || '', 'Disponible (Si/No)': v.available ? 'Sí' : 'No', 'Titulo de Variante': v.title, 'Precio Lista': precioLista, 'Precio Promo': precioPromo };
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flattenedData), 'Productos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coppelData), 'Formato Coppel');
    const domain = new URL(url.trim()).hostname.replace('www.', '');
    XLSX.writeFile(wb, `shopify-productos-${domain}.xlsx`);
  };

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
          <h1>Extractor de Productos Shopify</h1>
          <p>Pega la URL de una tienda Shopify para extraer su catálogo de productos públicos y exportarlo a Excel.</p>
        </div>
        <div className="form">
          <div className="input-group">
            <input type="url" className="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ej: https://tienda-ejemplo.com" aria-label="URL de la tienda Shopify" disabled={isLoading} />
            <button className="btn btn-primary" onClick={handleExtract} disabled={isLoading}>{isLoading ? 'Extrayendo...' : 'Extraer'}</button>
          </div>
        </div>
        <div className="status">
          {isLoading && (<div className="loading-status"><div className="loader"></div><p>Extrayendo...{extractedCount > 0 && ` (${extractedCount} productos encontrados)`}</p></div>)}
          {error && <div className="error-message">{error}</div>}
          {products.length > 0 && !isLoading && (<div className='success-message'><p>¡Éxito! Se encontraron {products.length} productos.</p><button className="btn btn-secondary" onClick={handleExport}>Descargar Excel</button></div>)}
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
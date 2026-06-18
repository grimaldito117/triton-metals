import React, { useState, useEffect } from 'react';
import logo from './logo.png';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || 'null'));
  
  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // App navigation state: 'dashboard' | 'transaccion' | 'precios'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Business states
  const [materiales, setMateriales] = useState([]);
  const [balance, setBalance] = useState({ resumen: { ingresos: 0, egresos: 0, balanceNeto: 0 }, historial: [] });
  
  // Transaction form states
  const [tipoTransaccion, setTipoTransaccion] = useState('compra');
  const [materialSeleccionado, setMaterialSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precioUnitario, setPrecioUnitario] = useState(0);
  const [descripcion, setDescripcion] = useState('');
  const [totalCalculado, setTotalCalculado] = useState(0);
  const [transaccionExito, setTransaccionExito] = useState('');
  const [transaccionError, setTransaccionError] = useState('');

  // Editing price state
  const [editMaterial, setEditMaterial] = useState(null);
  const [nuevoPrecioCompra, setNuevoPrecioCompra] = useState(0);
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState(0);
  const [editExito, setEditExito] = useState('');
  const [editError, setEditError] = useState('');

  // Load backend data when token changes
  useEffect(() => {
    if (token) {
      cargarMateriales();
      cargarBalance();
    }
  }, [token]);

  // Recalcular total de transacción en base a cantidad y precio unitario
  useEffect(() => {
    const cantVal = parseFloat(cantidad) || 0;
    const precioVal = parseFloat(precioUnitario) || 0;
    setTotalCalculado(cantVal * precioVal);
  }, [cantidad, precioUnitario]);

  // Cambiar precio unitario sugerido al cambiar de material o tipo
  useEffect(() => {
    if (materialSeleccionado && materiales.length > 0) {
      const matObj = materiales.find(m => m.id === parseInt(materialSeleccionado));
      if (matObj) {
        if (tipoTransaccion === 'compra') {
          setPrecioUnitario(matObj.precio_compra_por_kg);
        } else {
          setPrecioUnitario(matObj.precio_venta_por_kg);
        }
      }
    } else {
      setPrecioUnitario(0);
    }
  }, [materialSeleccionado, tipoTransaccion, materiales]);

  const cargarMateriales = async () => {
    try {
      const res = await fetch('/api/materiales', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMateriales(data);
      } else {
        desconectar();
      }
    } catch (err) {
      console.error('Error cargando materiales:', err);
    }
  };

  const cargarBalance = async () => {
    try {
      const res = await fetch('/api/balance', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (err) {
      console.error('Error cargando balance:', err);
    }
  };

  const manejarLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('usuario', JSON.stringify(data.usuario));
        setToken(data.token);
        setUsuario(data.usuario);
        setUsername('');
        setPassword('');
      } else {
        setLoginError(data.mensaje || 'Error en credenciales.');
      }
    } catch (err) {
      setLoginError('Error de conexión con el servidor.');
    }
  };

  const desconectar = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken('');
    setUsuario(null);
    setActiveTab('dashboard');
  };

  const registrarTransaccion = async (e) => {
    e.preventDefault();
    setTransaccionError('');
    setTransaccionExito('');

    if (!materialSeleccionado) {
      setTransaccionError('Por favor seleccione un material.');
      return;
    }
    if (!cantidad || parseFloat(cantidad) <= 0) {
      setTransaccionError('La cantidad debe ser mayor que 0.');
      return;
    }
    if (!precioUnitario || parseFloat(precioUnitario) < 0) {
      setTransaccionError('El precio debe ser un número válido.');
      return;
    }

    try {
      const res = await fetch('/api/transacciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo: tipoTransaccion,
          material_id: parseInt(materialSeleccionado),
          cantidad_kg: parseFloat(cantidad),
          precio_unitario: parseFloat(precioUnitario),
          detalle: descripcion
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTransaccionExito('Transacción registrada correctamente.');
        setCantidad('');
        setMaterialSeleccionado('');
        setDescripcion('');
        cargarBalance(); // Refrescar balances e historial
        setTimeout(() => setTransaccionExito(''), 3000);
      } else {
        setTransaccionError(data.mensaje || 'Error al guardar la transacción.');
      }
    } catch (err) {
      setTransaccionError('Error de red al guardar la transacción.');
    }
  };

  const abrirEditorPrecio = (material) => {
    setEditMaterial(material);
    setNuevoPrecioCompra(material.precio_compra_por_kg);
    setNuevoPrecioVenta(material.precio_venta_por_kg);
    setEditExito('');
    setEditError('');
  };

  const guardarPrecio = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditExito('');
    try {
      const res = await fetch(`/api/materiales/${editMaterial.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          precio_compra_por_kg: parseFloat(nuevoPrecioCompra),
          precio_venta_por_kg: parseFloat(nuevoPrecioVenta)
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEditExito('Costos actualizados con éxito.');
        cargarMateriales();
        setTimeout(() => {
          setEditMaterial(null);
        }, 1200);
      } else {
        setEditError(data.mensaje || 'Error al actualizar precios.');
      }
    } catch (err) {
      setEditError('Error de red al actualizar.');
    }
  };

  const formatearMoneda = (valor) => {
    return 'Bs. ' + Number(valor).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatearFecha = (fechaStr) => {
    const d = new Date(fechaStr);
    return d.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  };

  if (!token) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <img src={logo} alt="Tritón Metals" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
            <span>Tritón Metals</span>
          </div>
        </header>
        <div className="login-wrapper">
          <div className="card" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <img src={logo} alt="Tritón Metals Logo" style={{ width: '150px', height: '150px', borderRadius: '12px', objectFit: 'contain', backgroundColor: 'white', padding: '6px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)' }} />
              <h2 style={{ marginTop: '16px', fontWeight: '800' }}>Tritón Metals</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Reciclamos hoy, transformamos mañana</p>
            </div>
            {loginError && <div className="error-msg">{loginError}</div>}
            <form onSubmit={manejarLogin}>
              <div className="form-group">
                <label>Usuario</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="gerente o empleado"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  className="input-control"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary">Entrar</button>
            </form>
            <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <p>Demo Gerente: <strong>gerente</strong> / <strong>admin123</strong></p>
              <p>Demo Empleado: <strong>empleado</strong> / <strong>empleado123</strong></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header global */}
      <header className="app-header">
        <div className="logo">
          <img src={logo} alt="Tritón Metals" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
          <span>Tritón Metals</span>
        </div>
        <div>
          <span className={`badge-rol ${usuario?.rol}`}>{usuario?.rol}</span>
        </div>
      </header>

      {/* Contenido Principal por Pestañas */}
      <div className="container">
        {activeTab === 'dashboard' && (
          <>
            <div className="balance-card">
              <h3>Balance de Caja</h3>
              <div className={`balance-amount ${balance.resumen.balanceNeto >= 0 ? 'positivo' : 'negativo'}`}>
                {formatearMoneda(balance.resumen.balanceNeto)}
              </div>
              <div className="flow-grid">
                <div className="flow-card ingresos">
                  <span className="flow-label">Ventas (Ingresos)</span>
                  <span className="flow-value ingreso">{formatearMoneda(balance.resumen.ingresos)}</span>
                </div>
                <div className="flow-card egresos">
                  <span className="flow-label">Compras (Egresos)</span>
                  <span className="flow-value egreso">{formatearMoneda(balance.resumen.egresos)}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: '12px' }}>Historial Reciente</h3>
              {balance.historial.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No hay transacciones registradas aún.
                </div>
              ) : (
                <div className="transaction-list">
                  {balance.historial.map((t) => (
                    <div key={t.id} className="transaction-item">
                      <div className="transaction-left">
                        <span className="transaction-name">{t.material_nombre}</span>
                        <span className="transaction-meta">
                          {t.detalle && <strong>{t.detalle} • </strong>}
                          Por {t.registrado_por} • {formatearFecha(t.fecha)}
                        </span>
                      </div>
                      <div className="transaction-right">
                        <span className={`transaction-total ${t.tipo}`}>
                          {t.tipo === 'compra' ? '-' : '+'}{formatearMoneda(t.total)}
                        </span>
                        <div className="transaction-qty">
                          {t.cantidad_kg} kg @ {formatearMoneda(t.precio_unitario)}/kg
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'transaccion' && (
          <div className="card">
            <h2 style={{ marginBottom: '20px' }}>Registrar Operación</h2>
            {transaccionExito && <div className="success-msg">{transaccionExito}</div>}
            {transaccionError && <div className="error-msg">{transaccionError}</div>}
            
            <form onSubmit={registrarTransaccion}>
              <div className="transaction-type-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${tipoTransaccion === 'compra' ? 'active compra' : ''}`}
                  onClick={() => setTipoTransaccion('compra')}
                >
                  Compra (Egreso)
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${tipoTransaccion === 'venta' ? 'active venta' : ''}`}
                  onClick={() => setTipoTransaccion('venta')}
                >
                  Venta (Ingreso)
                </button>
              </div>

              <div className="form-group">
                <label>Material</label>
                <select
                  className="input-control"
                  value={materialSeleccionado}
                  onChange={(e) => setMaterialSeleccionado(e.target.value)}
                  required
                >
                  <option value="">Seleccione material...</option>
                  {materiales.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} (Sugerido: {formatearMoneda(tipoTransaccion === 'compra' ? m.precio_compra_por_kg : m.precio_venta_por_kg)}/kg)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Cantidad (en Kilogramos)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-control"
                  placeholder="0.00"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Precio por Kilogramo (Fijo de Catálogo)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-control"
                  value={precioUnitario}
                  disabled={true}
                  required
                />
              </div>

              <div className="form-group">
                <label>Descripción / Detalle (Opcional)</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: Chatarra de marcos de ventana o notas adicionales"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>

              <div className="card" style={{ background: 'rgba(0,0,0,0.15)', margin: '10px 0 20px 0', borderStyle: 'dashed' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Total estimado:</span>
                  <span style={{ color: tipoTransaccion === 'compra' ? 'var(--danger)' : 'var(--success)' }}>
                    {formatearMoneda(totalCalculado)}
                  </span>
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                Guardar {tipoTransaccion === 'compra' ? 'Compra' : 'Venta'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'precios' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Control de Precios</h2>
              {usuario.rol !== 'gerente' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>🔒 Solo lectura</span>
              )}
            </div>
            
            <div className="material-grid">
              {materiales.map((m) => (
                <div key={m.id} className="material-card">
                  <div className="material-info">
                    <h4>{m.nombre}</h4>
                    <div className="material-prices">
                      <div className="price-item">
                        <span className="price-label">Compra / kg</span>
                        <span className="price-value compra">{formatearMoneda(m.precio_compra_por_kg)}</span>
                      </div>
                      <div className="price-item">
                        <span className="price-label">Venta / kg</span>
                        <span className="price-value venta">{formatearMoneda(m.precio_venta_por_kg)}</span>
                      </div>
                    </div>
                  </div>
                  {usuario.rol === 'gerente' && (
                    <div className="material-actions">
                      <button
                        className="btn-icon"
                        onClick={() => abrirEditorPrecio(m)}
                        title="Modificar Precios"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal para Editar Precios de Materiales (Solo Gerente) */}
      {editMaterial && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Actualizar Costos</h3>
            <h4 style={{ color: 'var(--accent-color)', marginBottom: '16px' }}>{editMaterial.nombre}</h4>
            
            {editExito && <div className="success-msg">{editExito}</div>}
            {editError && <div className="error-msg">{editError}</div>}

            <form onSubmit={guardarPrecio}>
              <div className="form-group">
                <label>Precio Compra por Kg (Bs.)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-control"
                  value={nuevoPrecioCompra}
                  onChange={(e) => setNuevoPrecioCompra(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Precio Venta por Kg (Bs.)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-control"
                  value={nuevoPrecioVenta}
                  onChange={(e) => setNuevoPrecioVenta(e.target.value)}
                  required
                />
              </div>

              <div className="modal-buttons">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditMaterial(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barra de navegación inferior */}
      <nav className="nav-bar">
        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span>Balance</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'transaccion' ? 'active' : ''}`}
          onClick={() => setActiveTab('transaccion')}
        >
          <span className="nav-icon">💸</span>
          <span>Nueva Operación</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'precios' ? 'active' : ''}`}
          onClick={() => setActiveTab('precios')}
        >
          <span className="nav-icon">🏷️</span>
          <span>Costos</span>
        </button>
        <button className="nav-item" onClick={desconectar}>
          <span className="nav-icon">🚪</span>
          <span>Salir</span>
        </button>
      </nav>
    </div>
  );
}

export default App;

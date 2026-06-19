import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'secreto_super_seguro_chatarreria_2026';

app.use(cors());
app.use(express.json());

// Middleware para verificar JWT
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(403).json({ mensaje: 'No se proporcionó token de acceso.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ mensaje: 'Token no válido o expirado.' });
    }
    req.usuario = decoded;
    next();
  });
};

// Middleware para verificar rol de Gerente
const esGerente = (req, res, next) => {
  if (req.usuario.rol !== 'gerente') {
    return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol de Gerente.' });
  }
  next();
};

// --- ENDPOINTS ---

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ mensaje: 'Por favor, ingrese usuario y contraseña.' });
  }

  db.get('SELECT * FROM usuarios WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ mensaje: 'Error en el servidor.' });
    }
    if (!user) {
      return res.status(400).json({ mensaje: 'Usuario no encontrado.' });
    }

    const passwordValido = bcrypt.compareSync(password, user.password_hash);
    if (!passwordValido) {
      return res.status(400).json({ mensaje: 'Contraseña incorrecta.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      usuario: { id: user.id, username: user.username, rol: user.rol }
    });
  });
});

// Obtener lista de materiales y sus costos
app.get('/api/materiales', verificarToken, (req, res) => {
  db.all('SELECT * FROM materiales ORDER BY nombre ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ mensaje: 'Error al obtener materiales.' });
    }
    res.json(rows);
  });
});

// Modificar costos/precios de un material (Solo Gerente)
app.put('/api/materiales/:id', verificarToken, esGerente, (req, res) => {
  const { id } = req.params;
  const { precio_compra_por_kg, precio_venta_por_kg } = req.body;

  if (precio_compra_por_kg === undefined || precio_venta_por_kg === undefined) {
    return res.status(400).json({ mensaje: 'Precios de compra y venta son requeridos.' });
  }

  db.run(
    'UPDATE materiales SET precio_compra_por_kg = ?, precio_venta_por_kg = ? WHERE id = ?',
    [precio_compra_por_kg, precio_venta_por_kg, id],
    function (err) {
      if (err) {
        return res.status(500).json({ mensaje: 'Error al actualizar precios.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ mensaje: 'Material no encontrado.' });
      }
      res.json({ mensaje: 'Precios actualizados correctamente.' });
    }
  );
});

// Registrar una transacción (Compra o Venta)
app.post('/api/transacciones', verificarToken, (req, res) => {
  const { tipo, material_id, cantidad_kg, precio_unitario, detalle, fecha } = req.body;
  const usuario_id = req.usuario.id;

  if (!tipo || !material_id || !cantidad_kg || !precio_unitario) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }

  const total = cantidad_kg * precio_unitario;
  let fechaTransaccion = new Date().toISOString();
  if (fecha) {
    try {
      const parsedDate = new Date(fecha);
      if (!isNaN(parsedDate.getTime())) {
        fechaTransaccion = parsedDate.toISOString();
      }
    } catch (e) {
      // Usar fecha actual en caso de error de parseo
    }
  }

  db.run(
    `INSERT INTO transacciones (tipo, material_id, cantidad_kg, precio_unitario, total, detalle, fecha, usuario_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tipo, material_id, cantidad_kg, precio_unitario, total, detalle, fechaTransaccion, usuario_id],
    function (err) {
      if (err) {
        return res.status(500).json({ mensaje: 'Error al registrar transacción.' });
      }
      res.status(201).json({
        mensaje: 'Transacción registrada con éxito.',
        transaccionId: this.lastID
      });
    }
  );
});

// Obtener Balance de Caja e Historial de Transacciones
app.get('/api/balance', verificarToken, (req, res) => {
  const query = `
    SELECT t.*, m.nombre as material_nombre, u.username as registrado_por
    FROM transacciones t
    LEFT JOIN materiales m ON t.material_id = m.id
    LEFT JOIN usuarios u ON t.usuario_id = u.id
    ORDER BY t.fecha DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ mensaje: 'Error al calcular balance.' });
    }

    let ingresos = 0;
    let egresos = 0;

    rows.forEach((row) => {
      if (row.tipo === 'venta') {
        ingresos += row.total;
      } else if (row.tipo === 'compra') {
        egresos += row.total;
      }
    });

    const balanceNeto = ingresos - egresos;

    res.json({
      resumen: {
        ingresos,
        egresos,
        balanceNeto
      },
      historial: rows
    });
  });
});

// Eliminar una transacción (Solo Gerente)
app.delete('/api/transacciones/:id', verificarToken, esGerente, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM transacciones WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ mensaje: 'Error al eliminar la transacción.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ mensaje: 'Transacción no encontrada.' });
    }
    res.json({ mensaje: 'Transacción eliminada con éxito.' });
  });
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor Express corriendo en puerto ${PORT}`);
});

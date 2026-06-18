import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

// Utilizar la variable de entorno de Render o la que nos pasó el usuario por defecto
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_KfObaSy3Pr2C@ep-autumn-hall-aiygh7wv.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Envoltura de compatibilidad (wrapper) para imitar las funciones de sqlite3 en el servidor
const db = {
  get(sql, params, callback) {
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    pool.query(pgSql, params, (err, res) => {
      if (err) return callback(err);
      callback(null, res.rows[0]);
    });
  },
  
  all(sql, params, callback) {
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    pool.query(pgSql, params, (err, res) => {
      if (err) return callback(err);
      callback(null, res.rows);
    });
  },
  
  run(sql, params, callback) {
    let index = 1;
    let pgSql = sql.replace(/\?/g, () => `$${index++}`);
    
    // Convertir sintaxis SQLite a Postgres
    pgSql = pgSql.replace(/INSERT OR IGNORE/gi, 'INSERT');
    
    if (pgSql.includes('INSERT INTO usuarios')) {
      pgSql += ' ON CONFLICT (username) DO NOTHING';
    }
    if (pgSql.includes('INSERT INTO materiales')) {
      pgSql += ' ON CONFLICT (nombre) DO NOTHING';
    }
    
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
      pgSql += ' RETURNING id';
    }

    pool.query(pgSql, params, function(err, res) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      
      const context = {
        changes: res.rowCount,
        lastID: isInsert && res.rows.length > 0 ? res.rows[0].id : null
      };
      
      if (callback) {
        callback.call(context, null);
      }
    });
  }
};

// Inicialización de las tablas de base de datos en Postgres
pool.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK(rol IN ('gerente', 'empleado'))
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla usuarios:', err.message);
  } else {
    // Insertar usuarios iniciales por defecto
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin123', salt);
    const empleadoHash = bcrypt.hashSync('empleado123', salt);

    db.run(
      `INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)`,
      ['gerente', adminHash, 'gerente']
    );
    db.run(
      `INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)`,
      ['empleado', empleadoHash, 'empleado']
    );
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS materiales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    precio_compra_por_kg REAL NOT NULL DEFAULT 0.0,
    precio_venta_por_kg REAL NOT NULL DEFAULT 0.0
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla materiales:', err.message);
  } else {
    db.get('SELECT COUNT(*) as count FROM materiales', [], (err, row) => {
      if (!err && parseInt(row.count) === 0) {
        const materialesDefecto = [
          { nombre: 'Chatarra liviana', compra: 0.15, venta: 0.25 },
          { nombre: 'Chatarra pesada', compra: 0.20, venta: 0.30 },
          { nombre: 'Chatarra mixto', compra: 0.18, venta: 0.28 },
          { nombre: 'Cobre', compra: 6.50, venta: 7.50 },
          { nombre: 'Bronce', compra: 4.00, venta: 4.80 },
          { nombre: 'Radiador de cobre o bronce', compra: 3.50, venta: 4.20 },
          { nombre: 'Radiador de Aluminio', compra: 1.50, venta: 2.00 },
          { nombre: 'Aluminio duro', compra: 1.20, venta: 1.60 },
          { nombre: 'Aluminio latas de cervezas', compra: 0.90, venta: 1.30 },
          { nombre: 'Aluminio perfiles', compra: 1.30, venta: 1.70 },
          { nombre: 'Aluminio ollas', compra: 1.10, venta: 1.50 },
          { nombre: 'Cable de aluminio', compra: 0.80, venta: 1.10 },
          { nombre: 'Baterías', compra: 0.50, venta: 0.70 },
          { nombre: 'Care', compra: 0.30, venta: 0.45 },
          { nombre: 'Soplo', compra: 0.25, venta: 0.40 },
          { nombre: 'Pet', compra: 0.20, venta: 0.35 }
        ];

        materialesDefecto.forEach((m) => {
          db.run(
            `INSERT INTO materiales (nombre, precio_compra_por_kg, precio_venta_por_kg) VALUES (?, ?, ?)`,
            [m.nombre, m.compra, m.venta]
          );
        });
      }
    });
  }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS transacciones (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK(tipo IN ('compra', 'venta')),
    material_id INTEGER,
    cantidad_kg REAL NOT NULL,
    precio_unitario REAL NOT NULL,
    total REAL NOT NULL,
    detalle TEXT,
    fecha VARCHAR(50) NOT NULL,
    usuario_id INTEGER,
    FOREIGN KEY(material_id) REFERENCES materiales(id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla transacciones:', err.message);
  }
});

export default db;

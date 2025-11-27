import express from "express";
import pkg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const app = express();
app.use(express.json());

// ===== statische Dateien ausliefern =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

// ===== Datenbank-Connection =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== Tabelle automatisch anlegen =====
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS actions (
      id SERIAL PRIMARY KEY,
      username TEXT,
      hash TEXT,
      action_type TEXT NOT NULL,
      success BOOLEAN,
      duration_ms INT,
      site_name TEXT,
      attempts INT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Datenbanktabelle 'actions' geprüft / erstellt.");
}

// ===== Registrierung =====
app.post("/register", async (req, res) => {
  const { username, password, duration_ms, site_name, attempts } = req.body;
  if (!username || !password || !site_name) return res.status(400).send("Missing data");

  const hash = crypto.createHash("sha256").update(password).digest("hex");

  try {
    await pool.query(
      `INSERT INTO actions (username, hash, action_type, success, duration_ms, site_name, attempts)
       VALUES ($1, $2, 'register', true, $3, $4, $5)`,
      [username, hash, duration_ms, site_name, attempts]
    );
    res.send("registered");
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});


// ===== Login =====
app.post("/login", async (req, res) => {
  const { username, password, duration_ms, site_name, attempts } = req.body;
  if (!username || !password || !site_name) return res.status(400).send("Missing data");

  const hash = crypto.createHash("sha256").update(password).digest("hex");

  try {
    const result = await pool.query(
      `SELECT 1 FROM actions WHERE username=$1 AND hash=$2 AND action_type='register' LIMIT 1`,
      [username, hash]
    );

    const success = result.rowCount > 0;

    await pool.query(
      `INSERT INTO actions (username, action_type, success, duration_ms, site_name, attempts)
       VALUES ($1, 'login', $2, $3, $4, $5)`,
      [username, success, duration_ms, site_name, attempts]
    );

    res.send(success ? "login ok" : "login failed");
  } catch (e) {
    console.error(e);
    res.status(500).send("DB error");
  }
});


// ===== Server starten =====
app.listen(3000, async () => {
  console.log("Server läuft auf Port 3000");
  await initDb();
});

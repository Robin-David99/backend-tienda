// ======================================================
// app.js - BACKEND FINAL PARA RENDER
// ======================================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
// Render asigna un puerto automáticamente, usamos ese o el 3000
const PORT = process.env.PORT || 3000;

// IMPORTANTE: Los enlaces de los correos deben apuntar a tu web en Hostinger
const DOMINIO = 'https://totalishops.com'; 

// --- 1. MIDDLEWARES ---
app.use(cors({ origin: '*' })); // Permite que Hostinger se conecte a Render
app.use(express.json()); // Permite leer datos JSON

// Ruta de prueba para saber si Render está vivo
app.get('/', (req, res) => {
    res.send("✅ El Backend de Totalis Shop está funcionando en Render.");
});

// --- 2. BASE DE DATOS (SQLite) ---
// Nota: En Render (Plan Gratis), si el servidor se reinicia, la base de datos se vacía.
const db = new sqlite3.Database('./usuarios.db', (err) => {
    if (err) console.error('❌ Error DB:', err.message);
    else console.log('📚 Base de datos conectada.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT UNIQUE,
        contrasena TEXT,
        edad INTEGER,
        verificado INTEGER DEFAULT 0,
        token_verificacion TEXT,
        token_recuperacion TEXT,
        expiracion_token INTEGER,
        conteo_logins INTEGER DEFAULT 0
    )`);
});

// --- 3. CONFIGURACIÓN DEL CORREO ---
const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 587,
    secure: false,
    auth: {
        user: 'atencionalcliente@totalishops.com', 
        // 👇 ¡IMPORTANTE! Pon tu contraseña real aquí entre las comillas
        pass: '0O;0Blq?' 
    },
    tls: { rejectUnauthorized: false }
});

// ======================================================
// 4. RUTAS DE LA API
// ======================================================

// A. REGISTRO (Con envío de correo)
app.post('/api/registro', (req, res) => {
    const { nombre, email, contrasena, edad } = req.body;
    const token = uuidv4(); 

    const sql = `INSERT INTO usuarios (nombre, email, contrasena, edad, token_verificacion, verificado) VALUES (?, ?, ?, ?, ?, 0)`;
    
    db.run(sql, [nombre, email, contrasena, edad, token], async function(err) {
        if (err) {
            if (err.message.includes("UNIQUE")) return res.status(400).send("El correo ya está registrado.");
            return res.status(500).send("Error al registrar usuario.");
        }

        // Link apunta a tu web en Hostinger
        const linkVerificacion = `${DOMINIO}/verificar.html?token=${token}`;

        const mailOptions = {
            from: 'Totalis Shop <atencionalcliente@totalishops.com>',
            to: email,
            subject: '🚀 ¡Bienvenido a Totalis Shop! Confirma tu cuenta',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #FF6600;">¡Hola, ${nombre}!</h2>
                    <p>Gracias por registrarte. Solo falta un paso para activar tu cuenta.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${linkVerificacion}" style="background-color: #FF6600; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">VERIFICAR MI CUENTA</a>
                    </div>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Correo enviado a ${email}`);
            res.status(200).send("Registro exitoso. ¡Revisa tu correo para verificar la cuenta!");
        } catch (error) {
            console.error("❌ Error enviando correo:", error);
            res.status(200).send("Registro guardado, pero hubo un error enviando el correo.");
        }
    });
});

// B. LOGIN
app.post('/api/login', (req, res) => {
    const { email, contrasena } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE email = ?';

    db.get(sql, [email], (err, usuario) => {
        if (err) return res.status(500).send('Error de servidor.');
        if (!usuario) return res.status(401).send('Correo no registrado.');

        if (usuario.contrasena !== contrasena) {
            return res.status(401).send('Contraseña incorrecta.');
        }

        const nuevoConteo = (usuario.conteo_logins || 0) + 1;
        db.run('UPDATE usuarios SET conteo_logins = ? WHERE id = ?', [nuevoConteo, usuario.id]);

        res.status(200).json({
            mensaje: 'Login exitoso',
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                conteo: nuevoConteo
            }
        });
    });
});

// C. CONTACTO
app.post('/api/contacto', async (req, res) => {
    const { nombre, email, asunto, mensaje } = req.body;

    if (!nombre || !email || !mensaje) {
        return res.status(400).send("Faltan datos obligatorios.");
    }

    // Limpieza básica
    let mensajeSeguro = mensaje.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const mailOptions = {
        from: 'Totalis Shop <atencionalcliente@totalishops.com>',
        to: 'atencionalcliente@totalishops.com',
        replyTo: email,
        subject: `📩 Web: ${asunto || 'Sin asunto'}`,
        html: `
            <div style="border: 1px solid #ccc; padding: 20px;">
                <h3>Mensaje desde la Web</h3>
                <p><strong>De:</strong> ${nombre} (${email})</p>
                <p><strong>Mensaje:</strong> ${mensajeSeguro}</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send("Mensaje enviado correctamente.");
    } catch (error) {
        console.error("❌ Error enviando contacto:", error);
        res.status(500).send("Error interno: " + error.message);
    }
});

// D. RECUPERAR CONTRASEÑA
app.post('/api/recuperar-password', (req, res) => {
    const { email } = req.body;

    db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
        if (err) return res.status(500).send("Error de base de datos.");
        if (!usuario) return res.status(404).send("Correo no registrado.");

        // Rate Limit (40 seg)
        const ahora = Date.now();
        const tiempoEspera = 40000; 
        if (usuario.expiracion_token && (ahora - (usuario.expiracion_token - 3600000)) < tiempoEspera) {
             return res.status(429).send(`⏳ Por favor, espera unos segundos.`);
        }

        const token = uuidv4();
        const nuevaExpiracion = ahora + 3600000; // 1 hora

        db.run(`UPDATE usuarios SET token_recuperacion = ?, expiracion_token = ? WHERE email = ?`, 
            [token, nuevaExpiracion, email], async function(err) {
            
            if (err) return res.status(500).send("Error DB.");

            const link = `${DOMINIO}/restablecer.html?token=${token}`;

            const mailOptions = {
                from: 'Totalis Shop <atencionalcliente@totalishops.com>',
                to: email,
                subject: '🔑 Recuperar Contraseña',
                html: `
                    <h2>Restablecer Contraseña</h2>
                    <p>Haz clic abajo para cambiar tu clave:</p>
                    <a href="${link}">RESTABLECER CONTRASEÑA</a>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
                res.status(200).send("Correo de recuperación enviado.");
            } catch (e) {
                console.error(e);
                res.status(500).send("Error al enviar el correo.");
            }
        });
    });
});

// E. RESTABLECER (Final)
app.post('/api/restablecer-password', (req, res) => {
    const { token, nuevaPassword } = req.body;
    const ahora = Date.now();

    db.get(`SELECT * FROM usuarios WHERE token_recuperacion = ?`, [token], (err, usuario) => {
        if (!usuario) return res.status(400).send("Token inválido.");
        if (ahora > usuario.expiracion_token) return res.status(400).send("El token venció.");

        db.run(`UPDATE usuarios SET contrasena = ?, token_recuperacion = NULL WHERE id = ?`, 
            [nuevaPassword, usuario.id], (err) => {
            if (err) return res.status(500).send("Error al actualizar.");
            res.status(200).send("Contraseña actualizada.");
        });
    });
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 Servidor Render corriendo en puerto ${PORT}`);
});

// ======================================================
// app.js - BACKEND FINAL (Hostinger + SQLite)
// ======================================================

require('dotenv').config();


const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const DOMINIO = process.env.NODE_ENV === 'production' 
    ? 'https://totalishops.com' 
    : `http://localhost:${PORT}`;

console.log(`🌍 Configurado para: ${DOMINIO}`);

// --- 1. MIDDLEWARES ---
app.use(cors({ origin: '*' })); // Permite conexiones desde cualquier lugar
app.use(express.json()); // Permite leer JSON en las peticiones
app.use(express.static(__dirname)); // Sirve los archivos HTML/CSS/JS

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


// --- 2. BASE DE DATOS (usuarios.db) ---
const db = new sqlite3.Database('./usuarios.db', (err) => {
    if (err) console.error('❌ Error al abrir usuarios.db:', err.message);
    else console.log('📚 Conectado correctamente a usuarios.db');
});

// Inicializar Tabla
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


// --- 3. CONFIGURACIÓN DEL CORREO (CONFIRMADA ✅) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 587,             // Puerto que evita bloqueos
    secure: false,         // Obligatorio false para 587
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  // Tu contraseña verificada
    },
    tls: { rejectUnauthorized: false } // Ayuda con antivirus/firewalls
});

// Verificación rápida en consola (BORRAR ESTO ANTES DE SUBIR)
if (!process.env.EMAIL_USER) {
    console.error("❌ ERROR: No se leyó el archivo .env. Revisa que exista y tenga datos.");
} else {
    console.log("✅ Sistema de correos configurado para:", process.env.EMAIL_USER);
}


// ======================================================
// 4. RUTAS DE LA API
// ======================================================

// A. REGISTRO DE USUARIOS (Agregada para que puedas crear cuentas)
app.post('/api/registro', (req, res) => {
    const { nombre, email, contrasena, edad } = req.body;
    const token = uuidv4(); 

    const sql = `INSERT INTO usuarios (nombre, email, contrasena, edad, token_verificacion, verificado) VALUES (?, ?, ?, ?, ?, 0)`;
    
    db.run(sql, [nombre, email, contrasena, edad, token], async function(err) {
        if (err) {
            if (err.message.includes("UNIQUE")) return res.status(400).send("El correo ya está registrado.");
            return res.status(500).send("Error al registrar usuario.");
        }

        // --- AQUÍ EMPIEZA LA MAGIA DEL CORREO ---
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
                    <p style="font-size: 0.9em; color: #777;">Si no funciona el botón, copia este enlace: ${linkVerificacion}</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Correo de bienvenida enviado a ${email}`);
            res.status(200).send("Registro exitoso. ¡Revisa tu correo para verificar la cuenta!");
        } catch (error) {
            console.error("❌ Error enviando correo:", error);
            // Respondemos éxito aunque falle el correo para no bloquear al usuario, o puedes enviar error 500
            res.status(200).send("Registro guardado, pero hubo un error enviando el correo. Contacta soporte.");
        }
    });
});

// B. INICIO DE SESIÓN (LOGIN)
app.post('/api/login', (req, res) => {
    const { email, contrasena } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE email = ?';

    db.get(sql, [email], (err, usuario) => {
        if (err) return res.status(500).send('Error de servidor.');
        if (!usuario) return res.status(401).send('Correo no registrado.');

        // Verificar contraseña
        if (usuario.contrasena !== contrasena) {
            return res.status(401).send('Contraseña incorrecta.');
        }

        // Actualizar contador de logins
        const nuevoConteo = (usuario.conteo_logins || 0) + 1;
        db.run('UPDATE usuarios SET conteo_logins = ? WHERE id = ?', [nuevoConteo, usuario.id]);

        // Responder al Frontend
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

// C. CONTACTO (Versión Final Corporativa - Probada)
app.post('/api/contacto', async (req, res) => {
    console.log("------------------------------------------------");
    console.log("📡 1. SOLICITUD RECIBIDA EN /api/contacto");
    
    // VERIFICAR QUÉ DATOS LLEGAN DEL FRONTEND
    console.log("📦 2. Datos recibidos (req.body):", req.body);
    
    const { nombre, email, asunto, mensaje } = req.body;

    // VALIDAR SI LLEGARON VACÍOS
    if (!nombre || !email || !mensaje) {
        console.error("❌ 3. ERROR: Faltan datos. Nombre, email o mensaje están vacíos.");
        return res.status(400).send("Faltan datos obligatorios.");
    }
    console.log("✅ 3. Datos validados correctamente.");

    // LIMPIEZA DE SEGURIDAD
    let mensajeSeguro = mensaje
        .replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/https?:\/\//gi, " [ENLACE-DETECTADO] ")
        .replace(/www\./gi, " www . ");

    const mailOptions = {
        from: 'Totalis Shop <atencionalcliente@totalishops.com>', // TU CORREO (OBLIGATORIO)
        to: 'atencionalcliente@totalishops.com', // TU CORREO (DESTINO)
        replyTo: email, // EL CORREO DEL CLIENTE (PARA RESPONDERLE)
        subject: `📩 Web: ${asunto || 'Sin asunto'}`,
        html: `
            <div style="border: 1px solid #ccc; padding: 20px;">
                <h3>Mensaje desde la Web</h3>
                <p><strong>De:</strong> ${nombre} (${email})</p>
                <p><strong>Mensaje:</strong> ${mensajeSeguro}</p>
            </div>
        `
    };

    console.log("📨 4. Intentando conectar con Hostinger...");

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log("✅ 5. ¡ÉXITO! Hostinger aceptó el correo.");
        console.log("🆔 ID del mensaje:", info.messageId);
        res.status(200).send("Mensaje enviado correctamente.");
    } catch (error) {
        console.error("❌ 5. ERROR FATAL AL ENVIAR:", error);
        res.status(500).send("Error interno: " + error.message);
    }
    console.log("------------------------------------------------");
});


// ======================================================
// D. RECUPERAR CONTRASEÑA (Con espera de 40 seg ⏳)
// ======================================================
app.post('/api/recuperar-password', (req, res) => {
    const { email } = req.body;

    // 1. PRIMERO: Buscamos al usuario para ver si ya pidió un token recientemente
    db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
        if (err) return res.status(500).send("Error de base de datos.");
        if (!usuario) return res.status(404).send("Correo no registrado.");

        // 2. LÓGICA DE TIEMPO (Rate Limiting)
        const ahora = Date.now();
        const tiempoEspera = 40 * 1000; // 40 segundos (en milisegundos)
        const duracionToken = 3600000;  // 1 hora (duración estándar del token)

        // Si el usuario ya tiene un token activo, calculamos cuándo lo creó
        if (usuario.expiracion_token) {
            // MATEMÁTICA: Si vence en el futuro, restamos 1 hora para saber cuándo se creó
            const fechaCreacionEstimada = usuario.expiracion_token - duracionToken;
            const tiempoTranscurrido = ahora - fechaCreacionEstimada;

            // Si han pasado MENOS de 40 segundos desde la última solicitud...
            if (tiempoTranscurrido < tiempoEspera) {
                const segundosRestantes = Math.ceil((tiempoEspera - tiempoTranscurrido) / 1000);
                return res.status(429).send(`⏳ Por favor, espera ${segundosRestantes} segundos antes de solicitar otro correo.`);
            }
        }

        // 3. SI PASÓ EL TIEMPO, GENERAMOS UNO NUEVO
        const token = uuidv4();
        const nuevaExpiracion = ahora + duracionToken; // Expira en 1 hora

        const sqlUpdate = `UPDATE usuarios SET token_recuperacion = ?, expiracion_token = ? WHERE email = ?`;

        db.run(sqlUpdate, [token, nuevaExpiracion, email], async function(err) {
            if (err) return res.status(500).send("Error al actualizar la base de datos.");

            const link = `${DOMINIO}/restablecer.html?token=${token}`;

            const mailOptions = {
                from: 'Totalis Shop <atencionalcliente@totalishops.com>',
                to: email,
                subject: '🔑 Recuperar Contraseña',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #007bff;">Restablecer Contraseña</h2>
                        <p>Hemos recibido una solicitud para cambiar tu contraseña.</p>
                        <p>Haz clic en el siguiente botón para continuar (El enlace vence en 1 hora):</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${link}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">RESTABLECER CONTRASEÑA</a>
                        </div>
                        <p style="font-size: 12px; color: #777;">Si no solicitaste este cambio, ignora este correo.</p>
                    </div>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log(`📧 Token de recuperación enviado a: ${email}`);
                res.status(200).send("Correo de recuperación enviado.");
            } catch (e) {
                console.error("❌ Error enviando email:", e);
                res.status(500).send("Error al enviar el correo.");
            }
        });
    });
});

// E. RESTABLECER CONTRASEÑA
app.post('/api/restablecer-password', (req, res) => {
    const { token, nuevaPassword } = req.body;
    const ahora = Date.now();

    const sqlBuscar = `SELECT * FROM usuarios WHERE token_recuperacion = ?`;

    db.get(sqlBuscar, [token], (err, usuario) => {
        if (!usuario) return res.status(400).send("Token inválido.");
        if (ahora > usuario.expiracion_token) return res.status(400).send("El token venció.");

        const sqlUpdate = `UPDATE usuarios SET contrasena = ?, token_recuperacion = NULL WHERE id = ?`;
        db.run(sqlUpdate, [nuevaPassword, usuario.id], (err) => {
            if (err) return res.status(500).send("Error al actualizar.");
            res.status(200).send("Contraseña actualizada.");
        });
    });
});

// --- 5. INICIAR SERVIDOR ---
app.listen(PORT, () => {
    console.log("--------------------------------------------------");
    console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
    console.log("📂 Base de datos: ./usuarios.db");
    console.log("📧 Sistema de correos: ACTIVO (Puerto 587)");
    console.log("--------------------------------------------------");
});
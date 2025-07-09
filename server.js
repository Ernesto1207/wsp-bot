const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const http = require('http');
const socketIo = require('socket.io');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Inicializar Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Usar LocalAuth para guardar la sesión
let client = new Client({
    authStrategy: new LocalAuth() // Usamos LocalAuth para guardar la sesión
});

// Enviar el QR al frontend cuando se genera
client.on('qr', async (qr) => {
    console.log('Generando QR...'); // Log para indicar que el QR se está generando
    const qrBase64 = await qrcode.toDataURL(qr); // Generamos el QR en formato Base64
    io.emit('qr', qrBase64); // Emitir el QR al cliente en Base64
    console.log('QR generado y enviado al frontend.');
});

// Cuando el cliente esté listo
client.on('ready', () => {
    console.log('El cliente de WhatsApp está listo!');
    io.emit('ready'); // Emitir evento cuando el cliente esté listo
});

// Cuando el cliente esté desconectado
client.on('disconnected', () => {
    console.log('El cliente de WhatsApp se desconectó.');
    io.emit('disconnected'); // Emitir evento de desconexión al frontend
});

// Ruta para enviar un mensaje a un número fijo
app.post('/send-message', (req, res) => {
    const phoneNumber = '51957917856';  // Número fijo al que se enviará el mensaje
    const message = 'Hola, este es un mensaje de prueba!';

    // Enviar un mensaje al número fijo
    client.sendMessage(`${phoneNumber}@c.us`, message)
        .then(() => {
            res.status(200).json({ success: true, message: 'Mensaje enviado correctamente' });
        })
        .catch((error) => {
            res.status(500).json({ success: false, message: error.message });
        });
});

// Ruta para hacer logout (desconectar)
app.post('/logout', (req, res) => {
    console.log('Cerrando sesión...');

    // Destruir la conexión de WhatsApp
    client.destroy().then(() => {
        // Eliminar la carpeta de sesión local (.wwebjs_auth y .wwebjs_cache)
        const authPath = path.join(__dirname, '.wwebjs_auth');  // Ruta de la carpeta de autenticación
        const cachePath = path.join(__dirname, '.wwebjs_cache'); // Ruta de la carpeta de caché

        // Eliminar las carpetas .wwebjs_auth y .wwebjs_cache
        fs.rm(authPath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error("Error al eliminar la carpeta de autenticación:", err);
            } else {
                console.log("Carpeta de autenticación eliminada correctamente.");
            }
        });

        fs.rm(cachePath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error("Error al eliminar la carpeta de caché:", err);
            } else {
                console.log("Carpeta de caché eliminada correctamente.");
            }
        });

        // Reiniciar el cliente para generar un nuevo QR
        client = new Client({
            authStrategy: new LocalAuth() // Volver a usar LocalAuth para que se genere un nuevo QR
        });

        client.initialize();  // Inicializar el cliente nuevamente

        // Emitir que el cliente ha sido desconectado
        res.status(200).json({ success: true, message: 'Desconectado exitosamente. Iniciando sesión nuevamente...' });
        io.emit('disconnected'); // Notificar al frontend que el cliente fue desconectado

        // Esperar que se genere el nuevo QR
        client.on('qr', async (qr) => {
            console.log('Generando nuevo QR después del logout...');
            const qrBase64 = await qrcode.toDataURL(qr); // Generamos el QR en formato Base64
            io.emit('qr', qrBase64); // Emitir el QR al cliente en Base64
            console.log('Nuevo QR generado y enviado al frontend.');
        });

        client.on('ready', () => {
            console.log('El cliente de WhatsApp está listo!');
            io.emit('ready'); // Emitir evento cuando el cliente esté listo
        });
    }).catch((error) => {
        res.status(500).json({ success: false, message: error.message });
    });
});

// Iniciar el cliente de WhatsApp
client.initialize();

// Servir la carpeta pública para archivos estáticos
app.use(express.static('public'));

// Iniciar el servidor
server.listen(3001, () => {
    console.log('Servidor corriendo en http://localhost:3001');
});

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const http = require('http');
const socketIo = require('socket.io');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { getUserByDocumentNumber, getLastClinicalHistory } = require('./database');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

let isWhatsAppReady = false;

client.on('qr', async (qr) => {
    const qrBase64 = await qrcode.toDataURL(qr);
    io.emit('qr', qrBase64);
});

client.on('ready', () => {
    isWhatsAppReady = true;
    io.emit('ready');
});

client.on('disconnected', () => {
    isWhatsAppReady = false;
    io.emit('disconnected');
});

app.post('/send-message', (req, res) => {
    const phoneNumber = '51957917856';
    const message = 'Hola, este es un mensaje de prueba!';

    if (!isWhatsAppReady) {
        return res.status(503).json({ success: false, message: 'WhatsApp no está listo.' });
    }

    client.sendMessage(`${phoneNumber}@c.us`, message)
        .then(() => {
            res.status(200).json({ success: true, message: 'Mensaje enviado correctamente' });
        })
        .catch((error) => {
            res.status(500).json({ success: false, message: error.message });
        });
});

app.post('/logout', (req, res) => {
    client.destroy().then(() => {
        const authPath = path.join(__dirname, '.wwebjs_auth');
        const cachePath = path.join(__dirname, '.wwebjs_cache');

        fs.rm(authPath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error("Error al eliminar la carpeta de autenticación:", err);
            }
        });

        fs.rm(cachePath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error("Error al eliminar la carpeta de caché:", err);
            }
        });

        client = new Client({
            authStrategy: new LocalAuth()
        });

        client.initialize();

        res.status(200).json({ success: true, message: 'Desconectado exitosamente. Iniciando sesión nuevamente...' });
        io.emit('disconnected');

        client.on('qr', async (qr) => {
            const qrBase64 = await qrcode.toDataURL(qr);
            io.emit('qr', qrBase64);
        });

        client.on('ready', () => {
            isWhatsAppReady = true;
            io.emit('ready');
        });
    }).catch((error) => {
        res.status(500).json({ success: false, message: error.message });
    });
});

app.get('/sendToWhatsApp/:patientId', async (req, res) => {
    const patientId = req.params.patientId;

    if (!isWhatsAppReady) {
        return res.status(503).json({ success: false, message: 'El bot de WhatsApp no está listo aún.' });
    }

    try {
        const history = await getLastClinicalHistory(patientId);

        if (!history) {
            return res.status(404).json({ success: false, message: 'No se encontró historia clínica.' });
        }

        const pdfUrl = `${BASE_URL}/historia/historiaPDF/${history.id}`;
        await sendHistoryToWhatsApp(pdfUrl, patientId, history);

        res.status(200).json({ success: true, message: 'La historia clínica ha sido enviada a WhatsApp.' });

    } catch (error) {
        console.error('Error al enviar la historia clínica:', error);
        res.status(500).json({ success: false, message: 'Hubo un error al enviar la historia clínica.' });
    }
});

const sendHistoryToWhatsApp = async (pdfUrl, patientId, historiaClinica) => {
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    try {
        const response = await axios({
            url: pdfUrl,
            method: 'GET',
            responseType: 'arraybuffer',
        });

        const filePath = `${tempDir}/${patientId}_historia.pdf`;
        fs.writeFileSync(filePath, response.data);

        const patient = await getUserByDocumentNumber(patientId);
        const phoneNumber = formatPhoneNumber(patient.celular);

        if (isWhatsAppReady) {
            const message = new MessageMedia('application/pdf', fs.readFileSync(filePath).toString('base64'), 'Historia clínica');
            await client.sendMessage(`${phoneNumber}@c.us`, message);

            fs.unlinkSync(filePath);
        } else {
            console.error('El cliente de WhatsApp no está listo para enviar el mensaje.');
        }

        if (historiaClinica.analisis_id) {
            const analisisPdfUrl = `${BASE_URL}/analisis/analisisPDF/${historiaClinica.analisis_id}`;
            await sendFileToWhatsApp(analisisPdfUrl, patientId, 'Análisis');
        }

        if (historiaClinica.receta_id) {
            const recetaPdfUrl = `${BASE_URL}/recetas/recetaPDF/${historiaClinica.receta_id}`;
            await sendFileToWhatsApp(recetaPdfUrl, patientId, 'Receta');
        }

    } catch (error) {
        console.error('Error al descargar o enviar el PDF:', error);
    }
};

const sendFileToWhatsApp = async (pdfUrl, patientId, fileType) => {
    try {
        const response = await axios({
            url: pdfUrl,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        const tempDir = './temp';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        const filePath = `${tempDir}/${patientId}_${fileType}.pdf`;
        fs.writeFileSync(filePath, response.data);

        const patient = await getUserByDocumentNumber(patientId);
        const phoneNumber = formatPhoneNumber(patient.celular);

        if (isWhatsAppReady) {
            const message = new MessageMedia('application/pdf', fs.readFileSync(filePath).toString('base64'), fileType);
            await client.sendMessage(`${phoneNumber}@c.us`, message);

            fs.unlinkSync(filePath);
        } else {
            console.error('El cliente de WhatsApp no está listo para enviar el mensaje.');
        }

    } catch (error) {
        console.error(`Error al descargar o enviar el PDF de ${fileType}:`, error);
    }
};

const formatPhoneNumber = (phoneNumber) => {
    if (phoneNumber && !phoneNumber.startsWith('51')) {
        return '51' + phoneNumber;
    }
    return phoneNumber;
};

// const BASE_URL = 'http://bioraysalud.test';
const BASE_URL = 'https://softraylaboratorio.com';

client.initialize();

app.use(express.static('public'));

server.listen(3001, () => {
    console.log('Servidor corriendo en http://localhost:3001');
});

import { createBot, createProvider, createFlow, addKeyword, MemoryDB, EVENTS } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import { getDashboardHtml } from './ui';

dotenv.config();

const MERCURY_LICENSE_KEY = process.env.MERCURY_LICENSE_KEY;
const API_URL = process.env.MERCURY_API_URL || 'https://crm.mercuryhub.com.ar/api';

// Global State for UI
let connectionStatus = 'initializing';
let currentQR = '';
let globalAgencyId = 'Connecting...';

/**
 * CAPA DE SEGURIDAD: Validación de Datos antes de la escritura
 */
const validateWebhookData = (data: any) => {
    if (!data.phoneNumber || !data.content) return false;
    return true;
};

const main = async () => {
    console.log('🚀 Iniciando CRMercury Worker Node (Self-Hosted)...');

    // 1. Iniciar Servidor de Salud INMEDIATAMENTE para pasar el Health Check de Render
    const app = express();
    const PORT = Number(process.env.PORT) || 10000;
    app.use(express.json());

    app.get('/health', (req, res) => res.status(200).send('OK'));
    app.get('/', (req, res) => res.send(getDashboardHtml(globalAgencyId)));
    app.get('/api/status', (req, res) => res.json({ status: connectionStatus, qr: currentQR, agencyId: globalAgencyId }));

    app.listen(PORT, '0.0.0.0', () => console.log(`📡 Health-check listening on port ${PORT}`));

    if (!MERCURY_LICENSE_KEY) {
        throw new Error('MERCURY_LICENSE_KEY is missing.');
    }

    try {
        let authResponse;
        const cleanApiUrl = API_URL.replace(/\/$/, "");

        // 2. Handshake Central
        console.log(`🔄 Sincronizando con El Oráculo...`);
        connectionStatus = 'authenticating';

        authResponse = await axios.post(`${cleanApiUrl}/workerauth`, {
            licenseKey: MERCURY_LICENSE_KEY.trim()
        }, {
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!authResponse?.data.valid) {
            connectionStatus = 'auth_failed';
            throw new Error(authResponse?.data.error || 'Licencia inválida.');
        }

        const agencyId = authResponse.data.agencyId;
        const instanceName = authResponse.data.instanceName || agencyId;
        globalAgencyId = agencyId;
        console.log('✅ Licencia Válida. Agency:', agencyId);

        // 3. Middlewares y Endpoints
        const evolutionAuthGuard = (req: any, res: any, next: any) => {
            const apiKey = req.headers['apikey'];
            if (apiKey !== MERCURY_LICENSE_KEY) {
                return res.status(401).send({ error: 'Unauthorized. Invalid apikey.' });
            }
            next();
        };

        app.post('/message/sendText/:instance', evolutionAuthGuard, async (req, res) => {
            try {
                const { number, text } = req.body;
                if (!number || !text) return res.status(400).send({ error: 'Missing number or text' });
                const cleanNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
                await (global as any).baileysProvider?.sendMessage(cleanNumber, text, {});
                res.status(200).send({ key: { id: Date.now().toString() } });
            } catch (err: any) {
                res.status(500).send({ error: err.message });
            }
        });

        // 4. Inicialización de WhatsApp (Estrategia Paralela)
        console.log('🤖 Inicializando motor WhatsApp (Baileys)...');
        connectionStatus = 'initializing_engine';

        const provider = createProvider(BaileysProvider, {
            writePort: false, // Desactivamos escritura de puerto de Baileys para evitar conflictos si existen
            phoneNumber: undefined
        });
        (global as any).baileysProvider = provider;

        provider.on('qr', (qr: string) => {
            console.log('✨ [DEBUG]: QR RECIBIDO EN MOTOR');
            currentQR = qr;
            connectionStatus = 'qr';
        });

        provider.on('ready', () => {
            console.log('✅ [DEBUG]: MOTOR LISTO');
            currentQR = '';
            connectionStatus = 'ready';
        });

        const bridgeFlow = addKeyword(EVENTS.WELCOME)
            .addAction(async (ctx: any, { provider }) => {
                if (ctx.from === 'status@broadcast') return;
                try {
                    const evolutionPayload = {
                        event: "messages.upsert",
                        data: {
                            messages: [{
                                key: {
                                    remoteJid: ctx.from.includes('@g.us') ? ctx.from : `${ctx.from}@s.whatsapp.net`,
                                    fromMe: false,
                                    id: ctx.key?.id || `msg-${Date.now()}`
                                },
                                pushName: ctx.name || "Contacto",
                                message: { conversation: ctx.body },
                                messageTimestamp: Math.floor(Date.now() / 1000)
                            }]
                        }
                    };
                    await axios.post(`${cleanApiUrl}/webhooks/evolution/${instanceName}`, evolutionPayload);
                } catch (error: any) {
                    console.error('❌ Error enviando a Oracle:', error.message);
                }
            });

        console.log('🚀 Lanzando Bot Engine...');
        // Usamos bot creation sin await para no bloquear el flujo si se queda en idle
        createBot({
            flow: createFlow([bridgeFlow]),
            provider,
            database: new MemoryDB(),
        }).then(() => {
            console.log('📡 Bot Engine iniciado correctamente.');
        }).catch(err => {
            console.error('❌ Error iniciando Bot Engine:', err);
        });

    } catch (e: any) {
        console.error('❌ Error Crítico:', e.message);
        connectionStatus = 'error';
    }
}

main();

import { createBot, createProvider, createFlow, addKeyword, MemoryDB, EVENTS } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import { getDashboardHtml } from './ui';
import fs from 'fs';
import path from 'path';

dotenv.config();

const MERCURY_LICENSE_KEY = process.env.MERCURY_LICENSE_KEY;
const API_URL = process.env.MERCURY_API_URL || 'https://crm.mercuryhub.com.ar/api';

// Global State
let connectionStatus = 'initializing';
let currentQR = '';
let globalAgencyId = 'Connecting...';
let logs: string[] = [];

const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    const fullMsg = `[${time}] ${msg}`;
    logs.push(fullMsg);
    if (logs.length > 100) logs.shift();
    console.log(fullMsg);
};

// CRASH DETECTION
process.on('uncaughtException', (err) => {
    addLog(`❌ CRUSH: Uncaught Exception: ${err.message}`);
    console.error(err);
});

process.on('unhandledRejection', (reason: any) => {
    addLog(`❌ CRUSH: Unhandled Rejection: ${reason?.message || reason}`);
    console.error(reason);
});

const validateWebhookData = (data: any) => {
    return !!(data.phoneNumber && data.content);
};

// SYSTEM MONITORING
process.on('SIGTERM', () => addLog('⚠️ SIGTERM recibido. El servidor se va a apagar.'));
process.on('SIGINT', () => addLog('⚠️ SIGINT recibido.'));

const main = async () => {
    addLog('🚀 Iniciando CRMercury Worker Node (Self-Hosted)...');

    // DELAYED BOT START TO PRESERVE BOOT RESOURCES
    let botStarted = false;

    const app = express();
    const PORT = Number(process.env.PORT) || 10000;
    app.use(express.json());

    // 1. Iniciar Servidor de Salud INMEDIATAMENTE
    app.get('/health', (req, res) => res.status(200).send('OK'));
    app.get('/', (req, res) => res.send(getDashboardHtml(globalAgencyId)));
    app.get('/api/status', (req, res) => res.json({ status: connectionStatus, qr: currentQR, agencyId: globalAgencyId }));
    app.get('/api/logs', (req, res) => res.json({ logs }));

    app.post('/api/reset', (req, res) => {
        addLog('⚠️ Reset solicitado por el usuario.');
        const authPath = path.join(process.cwd(), '.baileys_auth');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            addLog('✅ Carpeta de sesión eliminada.');
        }
        res.status(200).json({ success: true });
        // No salimos del proceso aquí, dejamos que el usuario refresque. 
        // En Render el contenedor se reiniciará si el health check falla o si provocamos un error controlado.
        setTimeout(() => process.exit(0), 1000);
    });

    app.listen(PORT, '0.0.0.0', () => {
        addLog(`📡 Servidor de control activo en puerto ${PORT}`);
    });

    if (!MERCURY_LICENSE_KEY) {
        addLog('❌ Error: Falta MERCURY_LICENSE_KEY.');
        connectionStatus = 'config_error';
        return;
    }

    try {
        const cleanApiUrl = API_URL.replace(/\/$/, "");
        addLog(`🔄 Sincronizando con El Oráculo...`);
        connectionStatus = 'authenticating';

        const authResponse = await axios.post(`${cleanApiUrl}/workerauth`, {
            licenseKey: MERCURY_LICENSE_KEY.trim()
        }, {
            timeout: 25000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!authResponse?.data.valid) {
            addLog('❌ Error: Licencia inválida.');
            connectionStatus = 'auth_failed';
            return;
        }

        const agencyId = authResponse.data.agencyId;
        const instanceName = authResponse.data.instanceName || agencyId;
        globalAgencyId = agencyId;
        connectionStatus = 'initializing_engine';
        addLog(`✅ Licencia Válida. Agencia ID: ${agencyId}`);

        // MEMORY MONITOR (Para detectar OOM en Render)
        setInterval(() => {
            const memory = process.memoryUsage();
            addLog(`💾 RSS: ${Math.round(memory.rss / 1024 / 1024)}MB | Heap: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);
        }, 12000);

        // Evolution API Mirror endpoints
        const evolutionAuthGuard = (req: any, res: any, next: any) => {
            const apiKey = req.headers['apikey'];
            if (apiKey !== MERCURY_LICENSE_KEY) return res.status(401).send({ error: 'Unauthorized' });
            next();
        };

        app.post('/message/sendText/:instance', evolutionAuthGuard, async (req, res) => {
            try {
                const { number, text } = req.body;
                const cleanNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
                await (global as any).baileysProvider?.sendMessage(cleanNumber, text, {});
                addLog(`📡 [Outbound] Mensaje enviado a ${number}`);
                res.status(200).send({ key: { id: Date.now().toString() } });
            } catch (err: any) {
                addLog(`❌ Error enviando mensaje: ${err.message}`);
                res.status(500).send({ error: err.message });
            }
        });

        // DELAYED BOT ENGINE TO PREVENT BOOT BLOCKING
        setTimeout(async () => {
            try {
                addLog('🤖 Inicializando motor de WhatsApp...');
                const provider = createProvider(BaileysProvider, {
                    name: instanceName,
                    phoneNumber: undefined,
                    writePort: false
                });
                (global as any).baileysProvider = provider;

                provider.on('qr', (qr: string) => {
                    addLog('✨ [QR] Nuevo código listo.');
                    currentQR = qr;
                    connectionStatus = 'qr';
                });

                provider.on('ready', () => {
                    addLog('✅ [MOTOR] Conectado.');
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
                            addLog(`❌ [Inbound] Error Oracle: ${error.message}`);
                        }
                    });

                addLog('🚀 Lanzando orquestador...');
                await createBot({
                    flow: createFlow([bridgeFlow]),
                    provider,
                    database: new MemoryDB(),
                });
                addLog('📡 Orquestador iniciado.');
            } catch (err: any) {
                addLog(`❌ Error en motor: ${err.message}`);
            }
        }, 3000);

    } catch (e: any) {
        addLog(`❌ Error Crítico: ${e.message}`);
        connectionStatus = 'error';
    }
}

main();

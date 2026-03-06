import { createBot, createProvider, createFlow, addKeyword, MemoryDB, EVENTS } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';
import { getDashboardHtml } from './ui';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

// SYSTEM MONITORING
process.on('SIGTERM', () => addLog('⚠️ SIGTERM recibido (Render Apagando).'));

const main = async () => {
    addLog('🚀 CRMercury Worker Node (Self-Hosted) - Antigravity Build');

    const app = express();
    const PORT = Number(process.env.PORT) || 10000;
    app.use(express.json());

    // 1. HTTP Server setup (Prioritario)
    app.get('/health', (req, res) => res.status(200).send('OK'));
    app.get('/ping', (req, res) => res.status(200).send('pong'));
    app.get('/', (req, res) => res.send(getDashboardHtml(globalAgencyId)));
    app.get('/api/status', (req, res) => res.json({ status: connectionStatus, qr: currentQR, agencyId: globalAgencyId }));
    app.get('/api/logs', (req, res) => res.json({ logs }));

    app.post('/api/reset', (req, res) => {
        addLog('⚠️ Realizando Hard Reset de sesión...');
        const authPath = path.join(process.cwd(), '.baileys_auth');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            addLog('✅ Datos de sesión eliminados.');
        }
        res.status(200).json({ success: true });
        setTimeout(() => process.exit(0), 1000);
    });

    app.listen(PORT, '0.0.0.0', () => {
        addLog(`📡 Panel de control desplegado en puerto ${PORT}`);
    });

    // MEMORY & CPU MONITOR (Resistente a bloqueos)
    setInterval(() => {
        const memory = process.memoryUsage();
        const load = os.loadavg()[0];
        addLog(`📊 SYS: RSS=${Math.round(memory.rss / 1024 / 1024)}MB | CPU=${load.toFixed(2)} | Status=${connectionStatus}`);
    }, 15000);

    if (!MERCURY_LICENSE_KEY) {
        addLog('❌ Error: Falta MERCURY_LICENSE_KEY en entorno.');
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
            addLog(`❌ Licencia rechazada: ${authResponse?.data.error || 'Inválida'}`);
            connectionStatus = 'auth_failed';
            return;
        }

        const { agencyId, tenantSlug } = authResponse.data;
        const instanceName = authResponse.data.instanceName || agencyId;
        globalAgencyId = agencyId;
        connectionStatus = 'ready_to_boot';
        addLog(`✅ Licencia validada para ${tenantSlug} (${agencyId})`);

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
                addLog(`📡 [Outbound] Enviado a ${number}`);
                res.status(200).send({ key: { id: Date.now().toString() } });
            } catch (err: any) {
                addLog(`❌ Error Outbound: ${err.message}`);
                res.status(500).send({ error: err.message });
            }
        });

        // 2. LAZY BOT ENGINE (Iniciado por comando del usuario en la UI)
        let isEngineBooting = false;

        app.post('/api/start-engine', async (req, res) => {
            if (isEngineBooting || connectionStatus === 'qr' || connectionStatus === 'ready') {
                return res.status(200).json({ success: true, message: 'El motor ya está corriendo o iniciando.' });
            }

            isEngineBooting = true;
            connectionStatus = 'initializing_engine';
            addLog('⚡ [NODO] Solicitud de Encendido Manual Recibida.');
            res.status(200).json({ success: true });

            try {
                addLog('🤖 Iniciando motor Baileys (Multi-Device)...');

                const provider = createProvider(BaileysProvider, {
                    name: instanceName,
                    phoneNumber: undefined,
                    writePort: false
                });

                (global as any).baileysProvider = provider;

                provider.on('qr', (qr: string) => {
                    addLog('✨ [QR] Nuevo código generado con éxito.');
                    currentQR = qr;
                    connectionStatus = 'qr';
                });

                provider.on('ready', () => {
                    addLog('✅ [MOTOR] Nodo Conectado a WhatsApp.');
                    currentQR = '';
                    connectionStatus = 'ready';
                });

                provider.on('auth_failure', (err) => {
                    addLog(`❌ [MOTOR] Error de Auth: ${JSON.stringify(err)}`);
                    connectionStatus = 'auth_failed';
                    isEngineBooting = false;
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
                            addLog(`❌ [Inbound] Error Oracle Sync: ${error.message}`);
                        }
                    });

                addLog('🚀 Lanzando Orquestador Legion...');
                await createBot({
                    flow: createFlow([bridgeFlow]),
                    provider,
                    database: new MemoryDB(),
                });
                addLog('📡 Orquestador activo. Esperando conexión.');

            } catch (err: any) {
                addLog(`❌ Error en Engine Init: ${err.message}`);
                connectionStatus = 'error';
                isEngineBooting = false;
            }
        });

    } catch (e: any) {
        addLog(`❌ Error Crítico: ${e.message}`);
        connectionStatus = 'error';
    }
}

main();

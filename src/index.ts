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
    if (logs.length > 50) logs.shift();
    console.log(fullMsg);
};

const validateWebhookData = (data: any) => {
    return !!(data.phoneNumber && data.content);
};

const main = async () => {
    addLog('🚀 Iniciando CRMercury Worker Node (Self-Hosted)...');

    const app = express();
    const PORT = Number(process.env.PORT) || 10000;
    app.use(express.json());

    // UI Endpoints
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

    app.listen(PORT, '0.0.0.0', () => addLog(`📡 Servidor de control en puerto ${PORT}`));

    if (!MERCURY_LICENSE_KEY) {
        addLog('❌ Error: MERCURY_LICENSE_KEY no configurado.');
        connectionStatus = 'config_error';
        return;
    }

    try {
        const cleanApiUrl = API_URL.replace(/\/$/, "");
        addLog(`🔄 Sincronizando con El Oráculo en ${cleanApiUrl}...`);
        connectionStatus = 'authenticating';

        const authResponse = await axios.post(`${cleanApiUrl}/workerauth`, {
            licenseKey: MERCURY_LICENSE_KEY.trim()
        }, {
            timeout: 25000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!authResponse?.data.valid) {
            addLog('❌ Error: Licencia inválida o rechazada por El Oráculo.');
            connectionStatus = 'auth_failed';
            return;
        }

        const agencyId = authResponse.data.agencyId;
        const instanceName = authResponse.data.instanceName || agencyId;
        globalAgencyId = agencyId;
        addLog(`✅ Licencia Válida. Agencia ID: ${agencyId}`);

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

        // WhatsApp Strategy
        addLog('🤖 Preparando motor de WhatsApp (Baileys)...');
        connectionStatus = 'initializing_engine';

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
            addLog('✅ [MOTOR] WhatsApp Conectado y Listo.');
            currentQR = '';
            connectionStatus = 'ready';
        });

        provider.on('auth_failure', (err: any) => {
            addLog(`❌ [MOTOR] Error de autenticación: ${JSON.stringify(err)}`);
            connectionStatus = 'auth_failed';
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
                    addLog(`🚀 [Inbound] Mensaje de ${ctx.from} reenviado a la central.`);
                } catch (error: any) {
                    addLog(`❌ [Inbound] Error enviando a Oracle: ${error.message}`);
                }
            });

        addLog('🚀 Lanzando orquestador del bot...');
        createBot({
            flow: createFlow([bridgeFlow]),
            provider,
            database: new MemoryDB(),
        }).then(() => {
            addLog('📡 Orquestador iniciado. Esperando conexión de WhatsApp...');
        }).catch(err => {
            addLog(`❌ Error en orquestador: ${err.message}`);
        });

    } catch (e: any) {
        addLog(`❌ Error Crítico en main: ${e.message}`);
        connectionStatus = 'error';
    }
}

main();

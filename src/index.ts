import { createBot, createProvider, createFlow, addKeyword, MemoryDB, EVENTS } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import dotenv from 'dotenv';
import axios from 'axios';
import express from 'express';

dotenv.config();

const MERCURY_LICENSE_KEY = process.env.MERCURY_LICENSE_KEY;
const API_URL = process.env.MERCURY_API_URL || 'https://crm.mercuryhub.com.ar/api';

/**
 * CAPA DE SEGURIDAD: Validación de Datos antes de la escritura
 */
const validateWebhookData = (data: any) => {
    if (!data.phoneNumber || !data.content) return false;
    return true;
};

const main = async () => {
    console.log('🚀 Iniciando CRMercury Worker Node (Self-Hosted)...');

    if (!MERCURY_LICENSE_KEY) {
        throw new Error('MERCURY_LICENSE_KEY is missing.');
    }

    try {
        let authResponse;
        const cleanApiUrl = API_URL.replace(/\/$/, "");

        // 1. Handshake Central (Solo para licencia y config)
        console.log(`🔄 Sincronizando con El Oráculo...`);
        authResponse = await axios.post(`${cleanApiUrl}/workerauth`, {
            licenseKey: MERCURY_LICENSE_KEY.trim()
        }, {
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!authResponse?.data.valid) {
            throw new Error(authResponse?.data.error || 'Licencia inválida.');
        }

        const agencyId = authResponse.data.agencyId;
        const instanceName = authResponse.data.instanceName || agencyId;
        console.log('✅ Licencia Válida. Agency:', agencyId);

        // 2. Servidor de Salud
        const app = express();
        const PORT = process.env.PORT || 10000;
        app.use(express.json());

        app.get('/health', (req, res) => res.status(200).send('OK'));
        app.get('/', (req, res) => res.status(200).send('CRMercury Worker Active 🚀'));

        // Evolution API Mirror endpoints para escritura directa local
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
                // Limpiar formato @s.whatsapp.net
                const cleanNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;

                // Enviar a través de Provider Activo
                await (global as any).baileysProvider?.sendMessage(cleanNumber, text, {});
                console.log(`📡 [Outbound] Enviado a ${number}`);
                res.status(200).send({ key: { id: Date.now().toString() } });
            } catch (err: any) {
                console.error('Error sendText:', err.message);
                res.status(500).send({ error: err.message });
            }
        });

        app.post('/chat/sendPresence/:instance', evolutionAuthGuard, async (req, res) => {
            try {
                const { number, presence } = req.body;
                const cleanNumber = number.includes('@') ? number : `${number}@s.whatsapp.net`;
                if (presence === 'composing') {
                    await (global as any).baileysProvider?.vendor?.sendPresenceUpdate('composing', cleanNumber);
                }
                res.status(200).send({ success: true });
            } catch (err) {
                res.status(200).send({ success: false }); // No rompe flujo
            }
        });

        app.put('/chat/markMessageAsRead/:instance', evolutionAuthGuard, async (req, res) => {
            res.status(200).send({ success: true }); // Simulado para compatibilidad
        });

        // Endpoint local controlado (Managed Isolation)
        app.post('/webhook/local', (req, res) => {
            if (validateWebhookData(req.body)) {
                console.log('📡 Capturando evento local para Agencia:', agencyId);
                res.status(200).send({ success: true });
            } else {
                res.status(400).send({ error: 'Invalid payload' });
            }
        });

        app.listen(Number(PORT), '0.0.0.0', () => console.log(`📡 Nodo operando en puerto ${PORT}`));

        // 3. Inicialización de WhatsApp
        const provider = createProvider(BaileysProvider);
        (global as any).baileysProvider = provider;

        provider.on('qr', (qr: string) => {
            console.log('✨ [SISTEMA]: QR GENERADO. Usa tu teléfono para vincularte.');
            console.log(qr);
        });

        provider.on('ready', () => console.log('✅ Conexión con WhatsApp Lista 🚀'));

        // 4. Puente "Stealth" hacia The Oracle
        // Atrapamos todos los mensajes que entran a WhatsApp y los mandamos a tu plataforma principal
        const bridgeFlow = addKeyword(EVENTS.WELCOME)
            .addAction(async (ctx: any, { provider }) => {
                if (ctx.from === 'status@broadcast') return;

                try {
                    // Traductor: Formato BuilderBot -> Formato Evolution (Compatible con CRMercury)
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
                                message: {
                                    conversation: ctx.body
                                },
                                messageTimestamp: Math.floor(Date.now() / 1000)
                            }]
                        }
                    };

                    await axios.post(`${cleanApiUrl}/webhooks/evolution/${instanceName}`, evolutionPayload, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                    console.log(`🚀 [Node -> Oracle] Evento enviado a base central (Agency: ${instanceName})`);

                } catch (error: any) {
                    console.error('❌ Error enviando a Oracle:', error.message);
                }
            });

        createBot({
            flow: createFlow([bridgeFlow]),
            provider,
            database: new MemoryDB(),
        });

    } catch (e: any) {
        console.error('❌ Error Crítico:', e.message);
        process.exit(1);
    }
}

main();

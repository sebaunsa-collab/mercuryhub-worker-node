import axios from 'axios';

// The URL of the CRMercury instance where the webhook is hosted
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/voice/test-tenant-123';

async function simulateVoiceCall() {
    console.log('🎙️ Simulando llamada entrante desde Vapi.ai...');

    // Simulador estático rápido
    const startTime = Date.now();
    try {
        const response = await axios.post(WEBHOOK_URL, {
            message: {
                role: 'user',
                content: 'Hola, tengo una pregunta sobre sus servicios. ¿Me pueden ayudar con el precio del plan anual?'
            },
            call: {
                customer: {
                    number: '+5491122334455'
                }
            }
        });

        const latency = Date.now() - startTime;
        console.log('\n✅ The Legion (Voice Webhook) respondió:');
        console.log(`⏱️ Latencia de respuesta (E2E Webhook): ${latency}ms`);
        console.log('');
        console.log(`🤖 Respuesta TTS devuelta a Vapi:`);
        console.log(`"${response.data.message?.content || response.data}"`);
        console.log('');

        if (latency < 1500) {
            console.log('🚀 ¡Latencia Sub-1.5s lograda! Excelente para voz en tiempo real.');
        } else {
            console.log('⚠️ Latencia por encima de 1.5s. Puede haber un ligero retraso en la llamada antes del TTS.');
        }

    } catch (e: any) {
        console.error('❌ Error llamando al webhook:', e.response?.data || e.message);
    }
}

simulateVoiceCall();

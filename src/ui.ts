export const getDashboardHtml = (agencyId: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRMercury Node</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Fira+Code:wght@400&display=swap');
        body {
            background: #020617;
            background-image: radial-gradient(circle at 50% 0%, #0B2245 0%, #020617 70%);
            color: #f8fafc;
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            overflow: hidden;
        }
        .glass-panel {
            background: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.02);
            border-radius: 28px;
        }
        .qr-placeholder {
            background: #ffffff;
            padding: 16px;
            border-radius: 16px;
            display: inline-block;
        }
        .loader {
            border: 3px solid rgba(255, 255, 255, 0.05);
            border-top: 3px solid #E8DCC4;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .log-container {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            padding: 12px;
            font-family: 'Fira Code', monospace;
            font-size: 10px;
            color: #94a3b8;
            height: 120px;
            overflow-y: auto;
            width: 100%;
            text-align: left;
            margin-top: 20px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .log-line { border-bottom: 1px solid rgba(255, 255, 255, 0.02); padding: 2px 0; }
        .gradient-text {
            background: linear-gradient(135deg, #E8DCC4 0%, #C8B898 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>
<body>
    <div class="glass-panel w-full max-w-sm p-8 flex flex-col items-center text-center mx-4 z-10">
        <div style="margin-bottom: 32px">
            <h1 style="font-size: 24px; font-weight: 800; margin: 0" class="gradient-text">CRMercury Node</h1>
            <p style="font-size: 10px; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; margin: 4px 0">Self-Hosted Antenna</p>
            <p style="font-size: 9px; opacity: 0.5; font-family: monospace; margin: 0">Agency: <span id="agency-id">${agencyId}</span></p>
        </div>

        <div id="status-container" style="min-height: 220px; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center">
            <div class="loader" style="margin-bottom: 24px"></div>
            <p id="status-text" style="font-size: 12px; color: #cbd5e1; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite">Sincronizando sistemas...</p>
        </div>

        <div class="log-container" id="log-box">
            <div class="log-line">Esperando logs del servidor...</div>
        </div>
        
        <button onclick="resetSession()" style="margin-top: 16px; background: transparent; border: 1px solid rgba(232, 220, 196, 0.2); color: #C8B898; font-size: 10px; padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.3s">
            Hard Reset Session
        </button>
    </div>

    <script>
        let qrcode = null;
        let lastStatus = null;

        const updateStatusText = (status) => {
            const el = document.getElementById('status-text');
            if (!el) return;
            switch(status) {
                case 'initializing': el.innerText = 'Cargando núcleo...'; break;
                case 'authenticating': el.innerText = 'Validando licencia...'; break;
                case 'ready_to_boot': el.innerText = 'Licencia validada. Esperando ignición.'; break;
                case 'initializing_engine': el.innerText = 'Encendiendo motor criptográfico...'; el.style.color = '#E8DCC4'; break;
                case 'qr': el.innerText = 'Esperando escaneo...'; break;
                case 'ready': el.innerText = 'Conectado'; el.style.color = '#4ade80'; break;
                case 'auth_failed': el.innerText = 'Error de licencia'; el.style.color = '#f87171'; break;
                default: el.innerText = 'Procesando...';
            }
        };

        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/logs');
                const data = await res.json();
                const logBox = document.getElementById('log-box');
                logBox.innerHTML = data.logs.map(l => \`<div class="log-line">\${l}</div>\`).join('');
                logBox.scrollTop = logBox.scrollHeight;
            } catch(e) {}
        };

        const resetSession = async () => {
            if(confirm('¿Seguro que quieres reiniciar la sesión? Se borrarán los datos temporales del worker.')) {
                await fetch('/api/reset', { method: 'POST' });
                location.reload();
            }
        };

        const startEngine = async () => {
            const btn = document.getElementById('start-btn');
            if (btn) btn.innerHTML = 'Haciendo Ignición...';
            try {
                await fetch('/api/start-engine', { method: 'POST' });
                // El proximo checkStatus cambiará la UI automáticamente a loading
            } catch (err) {
                console.error(err);
            }
        };

        const checkStatus = async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                if (data.agencyId && data.agencyId !== 'Connecting...') {
                    document.getElementById('agency-id').innerText = data.agencyId;
                }

                updateStatusText(data.status);

                if (data.status === 'ready_to_boot') {
                    if (lastStatus !== 'ready_to_boot') {
                        document.getElementById('status-container').innerHTML = \`
                            <div style="width: 60px; height: 60px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px">
                                <svg style="width: 30px; height: 30px; color: #38bdf8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <button id="start-btn" onclick="startEngine()" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; box-shadow: 0 4px 14px 0 rgba(14, 165, 233, 0.39); transition: all 0.2s; margin-bottom: 8px">
                                Encender Antena
                            </button>
                            <p id="status-text" style="font-size: 11px; color: #94a3b8; margin: 0">Listo para generar el QR de conexión.</p>
                        \`;
                        lastStatus = 'ready_to_boot';
                    }
                }

                if (data.status === 'initializing_engine') {
                     if (lastStatus !== 'initializing_engine') {
                        document.getElementById('status-container').innerHTML = \`
                            <div class="loader" style="margin-bottom: 24px"></div>
                            <p id="status-text" style="font-size: 12px; color: #E8DCC4; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite">Encendiendo motor criptográfico...</p>
                            <p style="font-size: 10px; color: #94a3b8; margin-top: 8px">Esto tomará unos segundos...</p>
                        \`;
                        lastStatus = 'initializing_engine';
                     }
                }

                if (data.status === 'ready') {
                    if (lastStatus !== 'ready') {
                        document.getElementById('status-container').innerHTML = \`
                            <div style="width: 80px; height: 80px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px">
                                <svg style="width: 40px; height: 40px; color: #4ade80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h2 style="font-size: 18px; font-weight: 700; color: #4ade80; margin: 0 0 8px 0">Nodo Online</h2>
                            <p style="font-size: 11px; color: #94a3b8; margin: 0">Operando con éxito.</p>
                        \`;
                        lastStatus = 'ready';
                    }
                }

                if (data.status === 'qr' && data.qr) {
                    if (lastStatus !== 'qr') {
                        document.getElementById('status-container').innerHTML = \`
                            <div class="qr-placeholder" id="qrcode" style="margin-bottom: 24px"></div>
                            <h2 style="font-size: 14px; font-weight: 600; color: #f1f5f9; margin: 0 0 8px 0">Escanea el Integrador</h2>
                            <p style="font-size: 11px; color: #94a3b8; margin: 0">Abre WhatsApp > Dispositivos vinculados.</p>
                        \`;
                        qrcode = new QRCode(document.getElementById("qrcode"), {
                            text: data.qr,
                            width: 200, height: 200,
                            colorDark : "#020617", colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.M
                        });
                        lastStatus = 'qr';
                    } else if (qrcode) {
                        qrcode.clear();
                        qrcode.makeCode(data.qr);
                    }
                }
            } catch (err) {}
        };

        setInterval(checkStatus, 2000);
        setInterval(fetchLogs, 3000);
        checkStatus();
        fetchLogs();
    </script>
</body>
</html>
`;

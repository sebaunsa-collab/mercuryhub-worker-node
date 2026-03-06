export const getDashboardHtml = (agencyId: string) => `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CRMercury Node</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
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
            position: relative;
        }
        .glass-panel::before {
            content: '';
            position: absolute;
            top: 0; left: 10%; right: 10%; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
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
            width: 48px;
            height: 48px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .gradient-text {
            background: linear-gradient(135deg, #E8DCC4 0%, #C8B898 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .glow {
            text-shadow: 0 0 20px rgba(232, 220, 196, 0.3);
        }
        .ambient-light {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 300px; height: 300px;
            background: rgba(232, 220, 196, 0.05);
            filter: blur(80px);
            border-radius: 50%;
            z-index: -1;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="ambient-light"></div>
    <div class="glass-panel w-full max-w-sm p-8 flex flex-col items-center text-center mx-4 z-10 transition-all duration-500">
        <div class="mb-8">
            <h1 class="text-2xl font-extrabold tracking-tight gradient-text glow mb-1">CRMercury Node</h1>
            <p class="text-[10px] text-slate-400 font-mono tracking-widest uppercase mb-1">Self-Hosted Antenna</p>
            <p class="text-[9px] text-[#E8DCC4]/50 font-mono">Agency: <span id="agency-id">${agencyId}</span></p>
        </div>

        <div id="status-container" class="w-full flex flex-col items-center justify-center min-h-[220px]">
            <div class="loader mb-6"></div>
            <p id="status-text" class="text-xs text-slate-300 font-medium animate-pulse tracking-wide">Iniciando sistemas...</p>
        </div>
    </div>

    <script>
        let qrcode = null;
        let lastStatus = null;

        const updateStatusText = (status) => {
            const el = document.getElementById('status-text');
            if (!el) return;
            switch(status) {
                case 'initializing': el.innerText = 'Cargando núcleo...'; break;
                case 'authenticating': el.innerText = 'Validando licencia en The Oracle...'; break;
                case 'initializing_engine': el.innerText = 'Encendiendo motor de WhatsApp...'; break;
                case 'auth_failed': el.innerText = 'Error de autenticación central.'; break;
                default: el.innerText = 'Procesando...';
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

                if (data.status === 'ready') {
                    if (lastStatus !== 'ready') {
                        document.getElementById('status-container').innerHTML = \`
                            <div class="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                                <svg class="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h2 class="text-lg font-bold text-green-400 mb-2 tracking-wide">Conexión Establecida</h2>
                            <p class="text-xs text-slate-400">El nodo está operando de forma autónoma.</p>
                        \`;
                        lastStatus = 'ready';
                    }
                    setTimeout(checkStatus, 5000);
                    return;
                }

                if (data.status === 'qr' && data.qr) {
                    if (lastStatus !== 'qr') {
                        document.getElementById('status-container').innerHTML = \`
                            <div class="qr-placeholder shadow-2xl shadow-[#E8DCC4]/10 mb-6 transition-all" id="qrcode"></div>
                            <h2 class="text-sm font-semibold text-slate-200 mb-2 tracking-wide">Escanea el Integrador</h2>
                            <p class="text-xs text-slate-400">Abre WhatsApp en tu teléfono y <br>vincula este dispositivo.</p>
                        \`;
                        qrcode = new QRCode(document.getElementById("qrcode"), {
                            text: data.qr,
                            width: 220,
                            height: 220,
                            colorDark : "#0A1930",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.M
                        });
                        lastStatus = 'qr';
                    } else if (qrcode) {
                        qrcode.clear();
                        qrcode.makeCode(data.qr);
                    }
                }

            } catch (err) {
                console.error(err);
            }

            setTimeout(checkStatus, 2000);
        };

        checkStatus();
    </script>
</body>
</html>
`;

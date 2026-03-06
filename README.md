# 🤖 CRMercury Worker Node (Self-Hosted)
### Universal Deployment Antenna for CRMercury Legion

Este repositorio contiene la **Antena de Comunicación Descentralizada** de CRMercury. Permite a las agencias hostear su propio nodo de comunicación, garantizando soberanía de datos, reducción de costos de consumos (Bypass de Fuel) y marca blanca total.

---

## 🚀 Despliegue Rápido (Zero-Friction)

Este nodo es agnóstico a la plataforma y puede ser desplegado en cualquier entorno que soporte **Docker** o **Node.js**.

### 1. Requisitos Previos
Necesitarás las siguientes variables de entorno proporcionadas por tu panel de **CRMercury Oracle**:
- `MERCURY_LICENSE_KEY`: Tu llave de licencia única.
- `MERCURY_API_URL`: La URL de la API central (ej: `https://crm.mercuryhub.com.ar/api`).

---

## 🛠️ Opciones de Despliegue

### Opción A: Railway / Render (Recomendado)
Estos servicios detectarán automáticamente el `Dockerfile`.
1. Crea un nuevo servicio desde este repositorio.
2. Configura las **Variables de Entorno** (`MERCURY_LICENSE_KEY` y `MERCURY_API_URL`).
3. El puerto por defecto es el `10000`.
4. Una vez activo, revisa los logs para escanear el **QR de WhatsApp**.

### Opción B: VPS Propio (Docker Compose)
Para máxima potencia y control:
```bash
git clone https://github.com/tu-usuario/mercuryhub-worker-node.git
cd mercuryhub-worker-node
# Edita el archivo .env o establece las variables
docker-compose up -d
```

### Opción C: Coolify / CapRover
Simplemente añade este repositorio como una nueva aplicación. Coolify mapeará el puerto `10000` automáticamente.

---

## ⚠️ Nota sobre Vercel
**Vercel NO es compatible con este Worker.** 
Vercel utiliza funciones *Serverless* que se apagan tras unos segundos. Este Worker requiere un proceso persistente para mantener el socket de WhatsApp activo 24/7. Utiliza **Railway** o **Render** para una experiencia similar a Vercel pero compatible con servidores permanentes.

---

## 🔒 Seguridad e Isolation
Este nodo opera bajo el protocolo de **Managed Isolation**:
- **No accede a tu base de datos directamente.**
- Actúa como un puente cifrado hacia El Oráculo.
- Incluye validación de payloads para prevenir inyecciones.

---
**CRMercury Quantum Prime** | *Powering the next generation of AI Agencies.*

# Interactive Brokers API - Conexión Mínima

Script mínimo para conectarse a Interactive Brokers y obtener información básica de la cuenta.

## Requisitos

1. **TWS (Trader Workstation) o IB Gateway** instalado y ejecutándose
2. **Configurar API en TWS:**
   - File → Global Configuration → API → Settings
   - Habilitar "Enable ActiveX and Socket Clients"
   - Puerto 7497 para paper trading, 7496 para live trading

## Instalación

```bash
npm install
```

## Uso

```bash
npm start
```

## Lo que hace el script

1. Se conecta a TWS en localhost:7497
2. Obtiene las cuentas disponibles
3. Solicita información básica de la cuenta (tipo, liquidez neta, efectivo total)
4. Muestra la información y se desconecta

## Configuración de TWS

Antes de ejecutar el script, asegúrate de:

1. Abrir TWS o IB Gateway
2. Ir a File → Global Configuration → API → Settings
3. Marcar "Enable ActiveX and Socket Clients"
4. Verificar que el puerto sea 7497 (paper) o 7496 (live)
5. Opcionalmente agregar "127.0.0.1" en "Trusted IPs"
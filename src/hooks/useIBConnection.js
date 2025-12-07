import { useState, useEffect, useCallback, useRef } from 'react';
import IB from 'ib';

const INFO_CODES = new Set([2104, 2106, 2158, 2119]);
const IGNORED_CODES = new Set([300, 354, 10167]);

function debug(...args) {
  if (global.DEBUG_MODE) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[${timestamp}] [IB-CONNECTION]`, ...args);
  }
}

export function useIBConnection(options = {}) {
  const {
    host = process.env.IB_HOST || '127.0.0.1',
    port = parseInt(process.env.IB_PORT || '7496', 10),
    clientId = parseInt(process.env.IB_CLIENT_ID || '0', 10),
  } = options;

  const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected, error
  const [error, setError] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const clientRef = useRef(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    debug('connect() called');
    debug('Current status:', status);
    debug('isConnectingRef:', isConnectingRef.current);

    if (isConnectingRef.current || status === 'connected') {
      debug('Already connecting or connected, skipping');
      return;
    }

    isConnectingRef.current = true;
    setStatus('connecting');
    setError(null);

    debug('Creating IB client with config:', { clientId, host, port });

    const client = new IB({
      clientId,
      host,
      port,
    });

    clientRef.current = client;

    debug('Setting up connection timeout (10 seconds)');
    const connectionTimeout = setTimeout(() => {
      debug('Connection timeout triggered!');
      debug('Current status at timeout:', status);
      if (status !== 'connected') {
        debug('Setting error state due to timeout');
        setStatus('error');
        setError('Timeout - TWS no responde. Verificá que esté abierto.');
        isConnectingRef.current = false;
      }
    }, 10000);

    client.on('error', (err, data) => {
      const code = data?.code;
      const message = err?.message || String(err);

      debug('IB error event received:', { code, message, data });

      if (code && (INFO_CODES.has(code) || IGNORED_CODES.has(code))) {
        debug('Ignoring info/ignored code:', code);
        return;
      }

      if (message.includes('ECONNREFUSED')) {
        debug('ECONNREFUSED detected - TWS not running or port blocked');
        clearTimeout(connectionTimeout);
        setStatus('error');
        setError('No puedo conectar a TWS. ¿Está abierto?');
        isConnectingRef.current = false;
      } else if (message.includes('ETIMEDOUT')) {
        debug('ETIMEDOUT detected - Connection timed out');
        clearTimeout(connectionTimeout);
        setStatus('error');
        setError('Timeout conectando a TWS. Verificá que la API esté habilitada.');
        isConnectingRef.current = false;
      } else if (message.includes('Cannot send data when disconnected') ||
                 message.includes('Cannot disconnect if already disconnected')) {
        // Ignorar estos errores - son esperables
        debug('Ignoring expected disconnection error');
      } else {
        debug('Unhandled error:', message);
      }
    });

    client.on('connected', () => {
      debug('IB "connected" event received');
    });

    client.on('nextValidId', (orderId) => {
      debug('nextValidId received:', orderId);
      clearTimeout(connectionTimeout);
      setStatus('connected');
      isConnectingRef.current = false;
      debug('Requesting managed accounts...');
      client.reqManagedAccts();
    });

    client.on('managedAccounts', (accounts) => {
      debug('managedAccounts received:', accounts);
      const firstAccount = accounts.split(',')[0];
      setAccountId(firstAccount);
      debug('Account ID set to:', firstAccount);
    });

    client.on('disconnected', () => {
      debug('IB "disconnected" event received');
      setStatus('disconnected');
      isConnectingRef.current = false;
    });

    debug('Calling client.connect()...');
    debug('='.repeat(50));
    debug('TWS CONFIGURATION CHECKLIST:');
    debug('1. TWS abierto y logueado?');
    debug('2. Edit > Global Config > API > Settings:');
    debug('   - "Enable ActiveX and Socket Clients" = ON');
    debug('   - Socket Port = ' + port);
    debug('3. No hay otra app conectada con clientId=' + clientId);
    debug('='.repeat(50));

    try {
      client.connect();
      debug('client.connect() executed successfully');
    } catch (connectError) {
      debug('client.connect() threw error:', connectError.message);
    }

    debug('Calling client.reqIds(1)...');
    try {
      client.reqIds(1);
      debug('client.reqIds(1) executed successfully');
    } catch (reqIdsError) {
      debug('client.reqIds(1) threw error:', reqIdsError.message);
    }
    debug('Connection initiated, waiting for events...');
  }, [host, port, clientId, status]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      try {
        clientRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      clientRef.current = null;
    }
    setStatus('disconnected');
    isConnectingRef.current = false;
  }, []);

  const getClient = useCallback(() => {
    return clientRef.current;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    accountId,
    connect,
    disconnect,
    getClient,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
  };
}

export default useIBConnection;

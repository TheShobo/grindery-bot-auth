import axios from 'axios';
import jwt_decode from 'jwt-decode';
import { webcrypto } from 'crypto';
import { API_KEY_LINEA, getApiKey, getBotToken } from '../../secrets';

/**
 * Validates a token by making a request to an external service.
 * @param token - The token to be validated.
 * @param workspaceKey - Optional workspace key parameter.
 * @returns Promise<void>
 */
export const checkToken = async (
  token: string,
  workspaceKey: undefined = undefined,
): Promise<void> => {
  try {
    await axios.post(
      'https://orchestrator.grindery.org',
      {
        jsonrpc: '2.0',
        method: 'or_listWorkflows',
        id: new Date(),
        params: {
          ...(typeof workspaceKey !== 'undefined' && { workspaceKey }),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (err) {
    throw new Error(
      (err && err.response && err.response.data && err.response.data.message) ||
        err.message ||
        'Invalid token',
    );
  }
};

/**
 * Middleware to check if authentication is required and validate the token.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 * @returns void
 */
export const isRequired = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({ message: 'No credentials sent' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ message: 'Wrong authentication method' });
  }

  const token = authHeader.substring(7, authHeader.length);
  try {
    await checkToken(token);
  } catch (err) {
    return res.status(401).json({
      message:
        (err &&
          err.response &&
          err.response.data &&
          err.response.data.message) ||
        err.message,
    });
  }
  const user = jwt_decode(token) as any;
  res.locals.userId = user.sub;
  res.locals.workspaceId = user.workspace;

  next();
};

/**
 * Middleware to authenticate requests using an API key.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 * @returns void
 */
export const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).send({
      msg: 'Missing API key in headers',
    });
  }
  if (apiKey !== `Bearer ${await getApiKey()}`) {
    return res.status(401).send({
      msg: 'Invalid API key',
    });
  }
  next();
};

/**
 * Middleware to authenticate requests using an API key.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 * @returns void
 */
export const authenticateApiKeyLinea = async (req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).send({
      msg: 'Missing API key in headers',
    });
  }
  if (apiKey !== `Bearer ${API_KEY_LINEA}`) {
    return res.status(401).send({
      msg: 'Invalid API key',
    });
  }
  next();
};

/**
 * Middleware to validate a Telegram hash for user authentication.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next middleware function.
 * @returns void
 */
export const telegramHashIsValid = async (req, res, next) => {
  const BOT_TOKEN = await getBotToken();
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  const authorization = req.headers['authorization'];
  const hash = authorization.split(' ')[1];
  const data = Object.fromEntries(new URLSearchParams(hash));
  const encoder = new TextEncoder();
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash')
    .map((key) => `${key}=${data[key]}`)
    .sort()
    .join('\n');
  const secretKey = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign'],
  );
  const secret = await webcrypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(BOT_TOKEN),
  );
  const signatureKey = await webcrypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign'],
  );
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    signatureKey,
    encoder.encode(checkString),
  );
  const hex = Buffer.from(signature).toString('hex');
  const isValid = data.hash === hex;
  if (!isValid) {
    return res.status(403).json({ error: 'User is not authenticated' });
  }
  next();
};

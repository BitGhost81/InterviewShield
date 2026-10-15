import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.REALTIME_PORT || 1234);
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8081/api';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim() || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 UTF-8 bytes');
}

const ROLES = new Set(['candidate', 'interviewer']);
const JOIN_SESSION = 'join_session';
const LEAVE_SESSION = 'leave_session';
const PRESENCE = 'presence';
const CODE_SNAPSHOT = 'code_snapshot';
const CODE_DELTA = 'code_delta';
const CODE_RESYNC = 'code_resync';


const FULLSCREEN_EXIT = 'fullscreen_exit';
const FULLSCREEN_RESTORE = 'fullscreen_restore';
const FOCUS_LOST = 'focus_lost';
const FOCUS_RETURN = 'focus_return';
const ACTIVITY_SAVED = 'activity_saved';
const WEBRTC_OFFER = 'webrtc_offer';
const WEBRTC_ANSWER = 'webrtc_answer';
const WEBRTC_ICE_CANDIDATE = 'webrtc_ice_candidate';
const ERROR = 'error';


const __dirname = dirname(fileURLToPath(import.meta.url));

function getCertFiles() {
  const dir = __dirname;
  if (existsSync(resolve(dir, 'cert.pem')) && existsSync(resolve(dir, 'key.pem'))) {
    return {
      key: readFileSync(resolve(dir, 'key.pem')),
      cert: readFileSync(resolve(dir, 'cert.pem')),
    };
  }
  const files = readdirSync(dir);
  const keyFile = files.find(f => f.endsWith('-key.pem') || f === 'key.pem');
  const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('-key.pem') && f !== 'key.pem');
  if (keyFile && certFile) {
    return {
      key: readFileSync(resolve(dir, keyFile)),
      cert: readFileSync(resolve(dir, certFile)),
    };
  }
  throw new Error('No SSL certificates found in app directory. Please run setup.bat or mkcert.');
}

const rooms = new Map();
const httpsServer = createHttpsServer(getCertFiles());

const wss = new WebSocketServer({ server: httpsServer });

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Secure realtime WebSocket server running on port ${PORT} (wss://0.0.0.0:${PORT})`);
});

wss.on('connection', (socket) => {
  socket.context = null;

  socket.on('message', async (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      sendError(socket, 'invalid_json', 'Message must be valid JSON.');
      return;
    }

    if (!message || typeof message.type !== 'string') {
      sendError(socket, 'invalid_message', 'Message type is required.');
      return;
    }

    if (message.type === JOIN_SESSION) {
      if (socket.joining) {
        sendError(socket, 'already_joined', 'Session join is already in progress.');
        return;
      }
      socket.joining = true;
      try {
        await handleJoin(socket, message);
      } finally {
        socket.joining = false;
      }
      return;
    }

    if (!socket.context) {
      sendError(socket, 'not_joined', 'Join a session before sending messages.');
      return;
    }

    if (message.sessionCode !== socket.context.sessionCode) {
      sendError(socket, 'session_mismatch', 'Socket is already bound to a different session.');
      return;
    }

    if (message.senderRole && normalizeRole(message.senderRole) !== socket.context.role) {
      sendError(socket, 'role_mismatch', 'Message role does not match authenticated connection role.');
      return;
    }

    if (message.type === LEAVE_SESSION) {
      if (socket.context.role === 'interviewer' && message.payload?.reason === 'session_ended') {
        await handleSessionEnded(socket);
        return;
      }

      removeSocket(socket);
      closeSocket(socket, 1000, 'Left session');
      return;
    }

    if ([CODE_SNAPSHOT, CODE_DELTA, CODE_RESYNC, FULLSCREEN_EXIT, FULLSCREEN_RESTORE, FOCUS_LOST, FOCUS_RETURN, ACTIVITY_SAVED,
      WEBRTC_OFFER, WEBRTC_ANSWER, WEBRTC_ICE_CANDIDATE].includes(message.type)) {
      relaySessionMessage(socket, message);
      return;
    }

    sendError(socket, 'unsupported_message', `Message type "${message.type}" is not supported.`);
  });

  socket.on('close', () => removeSocket(socket));
  socket.on('error', () => removeSocket(socket));
});

async function handleJoin(socket, message) {
  if (socket.context) {
    sendError(socket, 'already_joined', 'Socket is already joined to a session.');
    return;
  }

  const sessionCode = normalizeSessionCode(message.sessionCode);
  const requestedRole = normalizeRole(message.senderRole);
  const token = message.payload?.token;

  if (!sessionCode) {
    sendError(socket, 'invalid_session', 'sessionCode is required.');
    return;
  }

  if (!ROLES.has(requestedRole)) {
    sendError(socket, 'invalid_role', 'senderRole must be candidate or interviewer.');
    return;
  }

  const auth = verifyToken(token);
  if (!auth.valid) {
    sendError(socket, 'unauthorized', auth.reason);
    return;
  }

  if (auth.role !== requestedRole) {
    sendError(socket, 'unauthorized', 'Authenticated role does not match requested role.');
    return;
  }

  const participant = await validateParticipant(sessionCode, token);
  if (!participant.valid) {
    sendError(socket, participant.code, participant.message);
    return;
  }
  if (normalizeRole(participant.role) !== requestedRole) {
    sendError(socket, 'unauthorized', 'Authenticated participant role does not match requested role.');
    return;
  }
  // The browser may close its probe while backend validation is pending.
  if (socket.readyState !== WebSocket.OPEN) return;

  const room = getRoom(sessionCode);
  const existingSocket = room[requestedRole];

  if (requestedRole === 'candidate' && existingSocket && existingSocket !== socket) {
    sendError(socket, 'session_occupied', 'A candidate is already connected to this session.');
    closeSocket(socket, 4003, 'Candidate slot occupied');
    return;
  }

  socket.context = {
    sessionCode,
    role: requestedRole,
    email: auth.email,
    senderId: String(participant.id),
    token,
  };

  if (existingSocket && existingSocket !== socket) {
    sendError(existingSocket, 'duplicate_connection', 'A newer connection replaced this session role.');
    closeSocket(existingSocket, 4000, 'Duplicate connection replaced');
  }

  room[requestedRole] = socket;
  broadcastPresence(sessionCode);
}

async function handleSessionEnded(socket) {
  const { sessionCode, token } = socket.context;
  const ended = await verifySessionEnded(sessionCode, token);

  if (!ended) {
    sendError(socket, 'session_not_ended', 'Session has not been ended by the server.');
    return;
  }

  notifyAndCloseSession(sessionCode, 'session_ended', 'This interview session has ended.');
}

function notifyAndCloseSession(sessionCode, code, message) {
  const room = rooms.get(sessionCode);
  if (!room) return;

  // Retrieve active peers before any teardown
  const peers = [room.candidate, room.interviewer].filter(Boolean);

  // Send the session_ended notification to all currently connected peers
  for (const peer of peers) {
    sendError(peer, code, message);
  }

  // Remove context and close sockets
  for (const peer of peers) {
    removeSocket(peer);
    closeSocket(peer, 1000, 'Session ended');
  }

  rooms.delete(sessionCode);
}

function getRoom(sessionCode) {
  if (!rooms.has(sessionCode)) {
    rooms.set(sessionCode, { candidate: null, interviewer: null });
  }

  return rooms.get(sessionCode);
}

function removeSocket(socket) {
  if (!socket.context) return;

  const { sessionCode, role } = socket.context;
  const room = rooms.get(sessionCode);

  if (room && room[role] === socket) {
    room[role] = null;

    if (!room.candidate && !room.interviewer) {
      rooms.delete(sessionCode);
    } else {
      broadcastPresence(sessionCode);
    }
  }

  socket.context = null;
}

function broadcastPresence(sessionCode) {
  const room = rooms.get(sessionCode);
  if (!room) return;

  const payload = {
    candidateConnected: Boolean(room.candidate),
    interviewerConnected: Boolean(room.interviewer),
    candidateId: room.candidate?.context?.senderId || null,
    interviewerId: room.interviewer?.context?.senderId || null,
  };

  for (const peer of [room.candidate, room.interviewer]) {
    send(peer, {
      type: PRESENCE,
      sessionCode,
      senderRole: 'server',
      senderId: 'server',
      payload,
    });
  }
}

function relaySessionMessage(socket, message) {
  const room = rooms.get(socket.context.sessionCode);
  const targetRole = socket.context.role === 'candidate' ? 'interviewer' : 'candidate';

  if (!room) {
    sendError(socket, 'room_not_found', 'Realtime session room was not found.');
    return;
  }

  if ([CODE_SNAPSHOT, CODE_DELTA].includes(message.type) && socket.context.role !== 'candidate') {
    sendError(socket, 'unauthorized', 'Only the candidate may send live code updates.');
    return;
  }

  if (message.type === CODE_RESYNC && socket.context.role !== 'interviewer') {
    sendError(socket, 'unauthorized', 'Only the interviewer may request code resync.');
    return;
  }

  if ([FULLSCREEN_EXIT, FULLSCREEN_RESTORE, FOCUS_LOST, FOCUS_RETURN, ACTIVITY_SAVED].includes(message.type) && socket.context.role !== 'candidate') {
    sendError(socket, 'unauthorized', 'Only the candidate may send tab activity alerts.');
    return;
  }

  if ([WEBRTC_OFFER, WEBRTC_ANSWER, WEBRTC_ICE_CANDIDATE].includes(message.type)
    && !ROLES.has(socket.context.role)) {
    sendError(socket, 'unauthorized', 'Only session participants may send WebRTC signaling.');
    return;
  }

  send(room[targetRole], {
    type: message.type,
    sessionCode: socket.context.sessionCode,
    senderRole: socket.context.role,
    senderId: socket.context.senderId,
    payload: socket.context.role === 'candidate'
      && [FULLSCREEN_EXIT, FULLSCREEN_RESTORE, FOCUS_LOST, FOCUS_RETURN, ACTIVITY_SAVED].includes(message.type)
      ? { ...(message.payload || {}), candidateId: socket.context.senderId }
      : (message.payload || {}),
  });
}

async function validateParticipant(sessionCode, token) {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionCode)}/participation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return {
        valid: false,
        code: response.status === 409 ? 'session_occupied' : (response.status === 403 || response.status === 401 ? 'unauthorized' : 'invalid_session'),
        message: 'Session participation could not be authorized.',
      };
    }
    const participant = await response.json();
    return {
      ...participant,
      valid: participant.status === 'ACTIVE' && participant.id != null && ROLES.has(normalizeRole(participant.role)),
      code: 'invalid_session',
      message: 'Session participation could not be verified.',
    };
  } catch {
    return { valid: false, code: 'invalid_session', message: 'Session could not be verified.' };
  }
}

async function verifySessionEnded(sessionCode, token) {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionCode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return false;
    const session = await response.json();
    return session.status === 'ENDED' || session.status === 'EXPIRED';
  } catch {
    return false;
  }
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, reason: 'JWT token is required in join_session payload.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'JWT token format is invalid.' };
  }

  const [header, payload, signature] = parts;
  const expectedSignature = base64UrlEncode(
    createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest()
  );

  if (!timingSafeEqualString(signature, expectedSignature)) {
    return { valid: false, reason: 'JWT token signature is invalid.' };
  }

  let claims;
  try {
    if (JSON.parse(base64UrlDecode(header)).alg !== 'HS256') {
      return { valid: false, reason: 'JWT algorithm must be HS256.' };
    }
    claims = JSON.parse(base64UrlDecode(payload));
  } catch {
    return { valid: false, reason: 'JWT token payload is invalid.' };
  }

  if (!claims || typeof claims.sub !== 'string' || !claims.sub || typeof claims.role !== 'string' || !claims.role) {
    return { valid: false, reason: 'JWT token is missing required claims.' };
  }

  if (!Number.isFinite(claims.exp) || Date.now() >= claims.exp * 1000) {
    return { valid: false, reason: 'JWT token has expired.' };
  }

  return {
    valid: true,
    email: claims.sub,
    role: normalizeRole(claims.role),
  };
}

function sendError(socket, code, message) {
  if (!socket) return;
  send(socket, {
    type: ERROR,
    sessionCode: socket.context?.sessionCode || null,
    senderRole: 'server',
    senderId: 'server',
    payload: { code, message },
  });
}

function send(socket, message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function closeSocket(socket, code, reason) {
  if (!socket) return;
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
}

function normalizeSessionCode(sessionCode) {
  if (typeof sessionCode !== 'string') return '';
  return sessionCode.trim().toUpperCase();
}

function normalizeRole(role) {
  if (typeof role !== 'string') return '';
  return role.trim().toLowerCase();
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

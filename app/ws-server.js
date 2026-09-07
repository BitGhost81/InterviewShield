import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.REALTIME_PORT || 1234);
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8081/api';
const JWT_SECRET = process.env.JWT_SECRET || 'interviewshield-secret-key-2026-very-long-string';

const ROLES = new Set(['candidate', 'interviewer']);
const JOIN_SESSION = 'join_session';
const LEAVE_SESSION = 'leave_session';
const PRESENCE = 'presence';
const CODE_SNAPSHOT = 'code_snapshot';
const CODE_DELTA = 'code_delta';
const CODE_RESYNC = 'code_resync';
const TAB_SWITCH = 'tab_switch';
const TAB_RETURN = 'tab_return';
const WEBRTC_OFFER = 'webrtc_offer';
const WEBRTC_ANSWER = 'webrtc_answer';
const WEBRTC_ICE_CANDIDATE = 'webrtc_ice_candidate';
const ERROR = 'error';

const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

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
      await handleJoin(socket, message);
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
      removeSocket(socket);
      closeSocket(socket, 1000, 'Left session');
      return;
    }

    if ([CODE_SNAPSHOT, CODE_DELTA, CODE_RESYNC, TAB_SWITCH, TAB_RETURN,
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

  const sessionExists = await verifySessionExists(sessionCode, token);
  if (!sessionExists) {
    sendError(socket, 'invalid_session', 'Session could not be verified.');
    return;
  }

  const room = getRoom(sessionCode);
  const existingSocket = room[requestedRole];

  socket.context = {
    sessionCode,
    role: requestedRole,
    email: auth.email,
    senderId: message.senderId ? String(message.senderId) : null,
  };

  if (existingSocket && existingSocket !== socket) {
    sendError(existingSocket, 'duplicate_connection', 'A newer connection replaced this session role.');
    closeSocket(existingSocket, 4000, 'Duplicate connection replaced');
  }

  room[requestedRole] = socket;
  broadcastPresence(sessionCode);
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

  if ([TAB_SWITCH, TAB_RETURN].includes(message.type) && socket.context.role !== 'candidate') {
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
    payload: message.payload || {},
  });
}

async function verifySessionExists(sessionCode, token) {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionCode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.ok;
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
    claims = JSON.parse(base64UrlDecode(payload));
  } catch {
    return { valid: false, reason: 'JWT token payload is invalid.' };
  }

  if (!claims.sub || !claims.role) {
    return { valid: false, reason: 'JWT token is missing required claims.' };
  }

  if (claims.exp && Date.now() >= claims.exp * 1000) {
    return { valid: false, reason: 'JWT token has expired.' };
  }

  return {
    valid: true,
    email: claims.sub,
    role: normalizeRole(claims.role),
  };
}

function sendError(socket, code, message) {
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

console.log(`Realtime WebSocket server running on port ${PORT}`);

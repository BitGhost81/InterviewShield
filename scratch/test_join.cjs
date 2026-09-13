const WebSocket = require('C:/Users/bitGhost/.codex/worktrees/c623/InterviewSheild/app/node_modules/ws');
const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 8081,
      path: '/api' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const timestamp = Date.now();
  
  // 1. Register interviewer
  console.log('Registering interviewer...');
  let interviewerRes = await post('/auth/register', { 
    name: 'Test Interviewer', 
    email: `interviewer_${timestamp}@test.com`, 
    password: 'password123', 
    role: 'INTERVIEWER' 
  });
  const interviewerToken = interviewerRes.data.token;
  console.log('Interviewer register status:', interviewerRes.status, 'Token:', Boolean(interviewerToken));

  // 2. Register candidate
  console.log('Registering candidate...');
  let candidateRes = await post('/auth/register', { 
    name: 'Test Candidate', 
    email: `candidate_${timestamp}@test.com`, 
    password: 'password123', 
    role: 'CANDIDATE' 
  });
  const candidateToken = candidateRes.data.token;
  const candidateId = candidateRes.data.id;
  console.log('Candidate register status:', candidateRes.status, 'Token:', Boolean(candidateToken));

  // 3. Create session as interviewer
  console.log('Creating session...');
  const sessionRes = await post('/sessions', { title: 'Test Session Realtime', problemStatement: 'Solve problem' }, interviewerToken);
  console.log('Create session status:', sessionRes.status, 'Code:', sessionRes.data.sessionCode);

  const sessionCode = sessionRes.data.sessionCode;

  // 4. Test WebSocket join as candidate
  console.log('Connecting candidate via WebSocket to wss://localhost:1234...');
  const ws = new WebSocket('wss://localhost:1234');
  
  ws.on('open', () => {
    console.log('WebSocket connection opened!');
    ws.send(JSON.stringify({
      type: 'join_session',
      sessionCode: sessionCode,
      senderRole: 'candidate',
      senderId: String(candidateId),
      payload: { token: candidateToken }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received WebSocket message:', msg.type, msg.payload);
    if (msg.type === 'presence' && msg.payload?.candidateConnected) {
      console.log('SUCCESS: Realtime candidate join test PASSED!');
      ws.close();
      process.exit(0);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket Error:', err.message);
    process.exit(1);
  });
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

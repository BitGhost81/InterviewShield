import os
import json
import urllib.request
import urllib.error
from pathlib import Path
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

from interview_ai import process_audio_payload

class GeminiCopilotHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path not in ("/chat", "/process-audio"):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "Not found"}')
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        
        try:
            req_data = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid JSON"}')
            return

        if self.path == "/process-audio":
            status_code, resp_dict = process_audio_payload(req_data)
            out_bytes = json.dumps(resp_dict).encode('utf-8')
            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out_bytes)))
            self.end_headers()
            self.wfile.write(out_bytes)
            return

        message = req_data.get('message', '')
        history = req_data.get('history', [])
        context = req_data.get('context', {})

        load_dotenv(override=True)
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=True)

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("[DEBUG] GEMINI_API_KEY environment variable is missing or empty!")
            out_bytes = b'{"error": "GEMINI_API_KEY is not configured."}'
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out_bytes)))
            self.end_headers()
            self.wfile.write(out_bytes)
            return

        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

        ctx_info = []
        if context.get("role"):
            ctx_info.append(f"Interview Role/Title: {context.get('role')}")
        if context.get("job_description"):
            ctx_info.append(f"Job Description: {context.get('job_description')}")
        if context.get("candidate_profile"):
            ctx_info.append(f"Candidate Name/Profile: {context.get('candidate_profile')}")
        if context.get("topics"):
            ctx_info.append(f"Topics: {', '.join(context.get('topics'))}")

        system_instruction = (
            "You are an AI Interview Copilot for InterviewShield assisting a human interviewer during a live interview.\n"
            "Be concise, direct, helpful, and professional. Answer questions, suggest follow-ups, or clarify technical concepts.\n"
            + ("\nINTERVIEW CONTEXT:\n" + "\n".join(ctx_info) if ctx_info else "")
        )

        contents = [
            {"role": "user", "parts": [{"text": system_instruction}]},
            {"role": "model", "parts": [{"text": "Understood. I am ready to assist as your interview copilot."}]}
        ]

        for item in history[-10:]:
            role = "user" if item.get("role") in ("user", "interviewer") else "model"
            text = item.get("content", "").strip()
            if text:
                contents.append({"role": role, "parts": [{"text": text}]})

        contents.append({"role": "user", "parts": [{"text": message}]})

        payload = json.dumps({"contents": contents}).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                candidates = res_data.get("candidates", [])
                reply_text = "No response text received from Gemini."
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        reply_text = parts[0]["text"].strip()

                out_bytes = json.dumps({"reply": reply_text}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(out_bytes)))
                self.end_headers()
                self.wfile.write(out_bytes)

        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8", errors="ignore")
            print("Gemini HTTP Error:", err.code, err_body)
            out_bytes = json.dumps({"error": f"Gemini API Error {err.code}: {err_body}"}).encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out_bytes)))
            self.end_headers()
            self.wfile.write(out_bytes)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            out_bytes = json.dumps({"error": f"Gemini request failed: {exc}"}).encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out_bytes)))
            self.end_headers()
            self.wfile.write(out_bytes)

def run():
    server_address = ('127.0.0.1', 8000)
    httpd = ThreadingHTTPServer(server_address, GeminiCopilotHandler)
    print("Gemini Copilot service running on http://127.0.0.1:8000 (threaded)")
    httpd.serve_forever()

if __name__ == "__main__":
    run()

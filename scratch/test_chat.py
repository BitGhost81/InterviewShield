import json
import urllib.request

url = "http://127.0.0.1:8000/chat"
data = json.dumps({
    "message": "Suggest 2 interview questions for a Senior Java Developer.",
    "history": [],
    "context": {"role": "Senior Java Developer"}
}).encode("utf-8")

req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)

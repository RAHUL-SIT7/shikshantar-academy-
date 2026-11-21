#!/bin/bash
chmod +x /app/applet/jre/bin/* 2>/dev/null
ln -sf /app/applet/jre/bin/java /usr/bin/java 2>/dev/null
export PATH="/app/applet/jre/bin:$PATH"

echo "=== Verifying Java Environment ==="
java -version 2>&1

echo "=== Starting Emulators in Background ==="
nohup npx firebase emulators:start --only auth,firestore --project demo-shikshantar-test > emulator.log 2>&1 &

echo "=== Polling for Emulator Readiness (Port 9098 & 8085) ==="
READY=0
for i in {1..30}; do
  if curl -s http://127.0.0.1:9098/ >/dev/null 2>&1 && curl -s http://127.0.0.1:8085/ >/dev/null 2>&1; then
    echo "✔ Emulators ready on ports 9098 and 8085 after $i seconds!"
    READY=1
    break
  fi
  sleep 1
done

if [ $READY -ne 1 ]; then
  echo "❌ Emulators failed to become ready in 30s. Log:"
  cat emulator.log
  exit 1
fi

fuser -k 4174/tcp 2>/dev/null || true

echo "=== Running Role-Aware Acceptance Suite ==="
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9098 GCLOUD_PROJECT=demo-shikshantar-test npx tsx tests/test_final_role_aware_closure.ts

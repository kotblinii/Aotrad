const { spawn } = require('child_process');
const path = require('path');

let psProcess = null;
let isReady = false;
let initPromise = null;
let stdoutBuffer = '';
const requestQueue = [];

function startWorker() {
  if (isReady && psProcess) return Promise.resolve(true);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    if (process.platform !== 'win32') {
      initPromise = null;
      return resolve(false);
    }

    const scriptPath = path.join(__dirname, 'win_ocr.ps1');
    const proc = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    psProcess = proc;
    stdoutBuffer = '';
    let settled = false;

    const failInit = () => {
      if (!settled) {
        settled = true;
        isReady = false;
        initPromise = null;
        resolve(false);
      }
    };

    const startupTimer = setTimeout(failInit, 4000);

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');

      if (!isReady) {
        if (stdoutBuffer.includes('NO_ENGINE')) {
          clearTimeout(startupTimer);
          failInit();
          return;
        }
        const readyIdx = stdoutBuffer.indexOf('READY');
        if (readyIdx !== -1) {
          clearTimeout(startupTimer);
          stdoutBuffer = stdoutBuffer.slice(readyIdx + 'READY'.length).replace(/^[\r\n]+/, '');
          isReady = true;
          settled = true;
          initPromise = null;
          resolve(true);
        }
      }

      while (isReady && stdoutBuffer.includes('<<END>>')) {
        const endIdx = stdoutBuffer.indexOf('<<END>>');
        const text = stdoutBuffer.slice(0, endIdx).trim();
        stdoutBuffer = stdoutBuffer.slice(endIdx + '<<END>>'.length).replace(/^[\r\n]+/, '');
        const pending = requestQueue.shift();
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve(text);
        }
      }
    });

    proc.on('close', () => {
      isReady = false;
      if (psProcess === proc) psProcess = null;
      initPromise = null;
      while (requestQueue.length > 0) {
        const pending = requestQueue.shift();
        clearTimeout(pending.timer);
        pending.reject(new Error('WinOCR encerrado'));
      }
      failInit();
    });

    proc.on('error', () => {
      failInit();
    });
  });

  return initPromise;
}

async function recognize(imageBuffer) {
  const ok = await startWorker();
  if (!ok || !psProcess || !psProcess.stdin.writable) {
    throw new Error('Windows.Media.Ocr indisponivel');
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = requestQueue.findIndex((r) => r.resolve === resolve);
      if (idx !== -1) requestQueue.splice(idx, 1);
      reject(new Error('Timeout WinOCR'));
    }, 2000);

    requestQueue.push({ resolve, reject, timer });
    psProcess.stdin.write(imageBuffer.toString('base64') + '\n');
  });
}

function terminate() {
  if (psProcess) {
    try {
      psProcess.stdin.write('EXIT\n');
    } catch (_e) {}
    try {
      psProcess.kill();
    } catch (_e) {}
    psProcess = null;
    isReady = false;
  }
}

module.exports = {
  startWorker,
  recognize,
  terminate
};


import { VFS } from './types';

export const BASE_URL = 'https://0c795e887ad5.ngrok-free.app';
export const UPDATE_ENDPOINT = `${BASE_URL}/update-code`;

export const INITIAL_VFS: VFS = {
  'index.html': `<!DOCTYPE html>
<html lang="pt-br">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI-CRAFT Studio</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { background: #0f172a; color: white; font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
      .card { background: #1e293b; padding: 2rem; border-radius: 1.5rem; border: 1px solid #334155; text-align: center; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
      .icon { font-size: 3rem; margin-bottom: 1rem; color: #6366f1; }
      h1 { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; }
      p { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin-top: 0.5rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">✨</div>
      <h1>Pronto para o Craft?</h1>
      <p>Configure sua integração n8n no botão "+" e descreva seu app no arquiteto ao lado.</p>
    </div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
  'main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
  'App.tsx': `import React from 'react';

export const App = () => {
  return null; 
};`,
  'types.ts': `export interface User {
  id: string;
  name: string;
}`
};

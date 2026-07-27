import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { initDB } from './db';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found.');
}
const mountNode = rootElement;

async function bootstrap() {
  await initDB();
  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('./sw.js', { scope: './' });
  }
}

void bootstrap().catch((error) => {
  mountNode.textContent = `数据库初始化失败：${error instanceof Error ? error.message : String(error)}`;
});

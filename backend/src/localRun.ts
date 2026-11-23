import { configureLocalEnvironment, LOCAL_DATABASE_NAME } from './localEnvironment';

configureLocalEnvironment();

async function main() {
  const { startServer } = await import('./server');
  const port = Number(process.env.PORT) || 5000;
  const { close } = await startServer(port, '127.0.0.1');
  console.log(`Local API: http://127.0.0.1:${port} (MongoDB: ${LOCAL_DATABASE_NAME})`);

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void close().catch((error) => {
      console.error(error instanceof Error ? error.message : 'Local API shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local API failed to start');
  process.exitCode = 1;
});

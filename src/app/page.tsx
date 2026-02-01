export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>ABBA Broker</h1>
      <p>This is an API-only service. See the API documentation for available endpoints.</p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/health</code> - Health check
        </li>
        <li>
          <code>POST /api/v1/publish/start</code> - Start a publish operation
        </li>
        <li>
          <code>PUT /api/v1/publish/upload</code> - Upload bundle
        </li>
        <li>
          <code>POST /api/v1/publish/complete</code> - Trigger deployment
        </li>
        <li>
          <code>GET /api/v1/publish/status</code> - Check publish status
        </li>
        <li>
          <code>POST /api/v1/publish/cancel</code> - Cancel a publish
        </li>
      </ul>
    </main>
  );
}

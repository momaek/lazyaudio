export function App(): React.JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        gap: 8,
      }}
    >
      <h1 style={{ fontSize: 32, margin: 0 }}>Hello world</h1>
      <p style={{ color: '#888', margin: 0 }}>LazyAudio · main window (T01 scaffold)</p>
    </main>
  )
}

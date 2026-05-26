export default function PageContainer({ children, style }) {
  return (
    <div style={{ minHeight: '100dvh', width: '100%', ...style }}>
      {children}
    </div>
  );
}
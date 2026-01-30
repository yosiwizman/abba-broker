export const metadata = {
  title: 'ABBA Broker',
  description: 'ABBA Hosting Broker - Backend service for managed app publishing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

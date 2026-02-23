import "./globals.css";

export const metadata = {
  title: "VentureOS Dashboard Next",
  description: "Hybrid Next.js frontend for VentureOS dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

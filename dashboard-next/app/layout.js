import "./globals.css";
import { DashboardSessionProvider } from "@/components/dashboard-session-context";

export const metadata = {
  title: "VentureOS Dashboard Next",
  description: "Hybrid Next.js frontend for VentureOS dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <DashboardSessionProvider>{children}</DashboardSessionProvider>
      </body>
    </html>
  );
}

import Footer from "./Footer";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <div className="container-page">
        <Topbar title={title} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <Sidebar />
          <main>{children}</main>
        </div>
        <Footer />
      </div>
    </div>
  );
}

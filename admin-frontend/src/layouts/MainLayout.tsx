import { Outlet } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
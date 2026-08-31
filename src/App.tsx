import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { VehicleProvider } from './contexts/VehicleContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Fillups from './pages/Fillups';
import AddFillup from './pages/AddFillup';
import Insights from './pages/Insights';
import Service from './pages/Service';
import Vehicle from './pages/Vehicle';
import Settings from './pages/Settings';

const LS_THEME = 'fuel.theme';

export default function App() {
  useEffect(() => {
    const stored = localStorage.getItem(LS_THEME);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={
            <ProtectedRoute>
              <VehicleProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/fillups" element={<Fillups />} />
                    <Route path="/add" element={<AddFillup />} />
                    <Route path="/service" element={<Service />} />
                    <Route path="/insights" element={<Insights />} />
                    <Route path="/vehicle" element={<Vehicle />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
              </VehicleProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

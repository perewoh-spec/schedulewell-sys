import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Pages are loaded on demand to keep the initial download small.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Appointments = lazy(() => import("./pages/Appointments"));
const MedicalRecords = lazy(() => import("./pages/MedicalRecords"));
const Patients = lazy(() => import("./pages/Patients"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Chat = lazy(() => import("./pages/Chat"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const Profile = lazy(() => import("./pages/Profile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { isStaff, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!isStaff) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AuthRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthRedirect />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/records" element={<ProtectedRoute><MedicalRecords /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute><StaffRoute><Patients /></StaffRoute></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/chat/:appointmentId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminRoute><UserManagement /></AdminRoute></ProtectedRoute>} />
            <Route path="/admin/audit" element={<ProtectedRoute><AdminRoute><AuditLogs /></AdminRoute></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute><AdminRoute><Reports /></AdminRoute></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

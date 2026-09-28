import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { RoutinePage } from './pages/RoutinePage'
import { PendingWorkoutsPage } from './pages/PendingWorkoutsPage'

const HistoryPage = lazy(() => import('./pages/deferredPages').then(module => ({ default: module.HistoryPage })))
const SettingsPage = lazy(() => import('./pages/deferredPages').then(module => ({ default: module.SettingsPage })))
const WorkoutPage = lazy(() => import('./pages/deferredPages').then(module => ({ default: module.WorkoutPage })))
const EditSessionPage = lazy(() => import('./pages/deferredPages').then(module => ({ default: module.EditSessionPage })))

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/rutina" element={<RoutinePage />} />
        <Route path="/rutina/editar" element={<SettingsPage />} />
        <Route path="/rutina/ejercicios" element={<SettingsPage />} />
        <Route path="/cuenta" element={<SettingsPage />} />
        <Route path="/cuenta/datos" element={<SettingsPage />} />
        <Route path="/configuracion" element={<Navigate to="/cuenta" replace />} />
        <Route path="/progreso" element={<HistoryPage />} />
        <Route path="/progreso/sesion/:sessionId/editar" element={<EditSessionPage />} />
        <Route path="/progreso/:exerciseId" element={<HistoryPage />} />
        <Route path="/entrenamiento" element={<WorkoutPage />} />
        <Route path="/pendientes" element={<PendingWorkoutsPage />} />
        <Route path="/entrenamiento/:templateId" element={<WorkoutPage />} />
        <Route path="/historial" element={<HistoryPage />} />
        <Route path="/historial/sesion/:sessionId/editar" element={<EditSessionPage />} />
        <Route path="/historial/:exerciseId" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
